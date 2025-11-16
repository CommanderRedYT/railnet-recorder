import type { TrainInfo } from './schema.js';

import express from 'express';
import fs from 'node:fs';
import { Gauge, register } from 'prom-client';

import 'dotenv/config';

export const labels = ['lineNumber', 'tripNumber', 'trainType'] as const;

export type LabelObject = Record<(typeof labels)[number], string>;

// gauges
const gpsLatGauge = new Gauge({
    name: 'trainnet_gps_lat',
    help: 'unset',
    labelNames: labels,
});

const gpsLongGauge = new Gauge({
    name: 'trainnet_gps_lon',
    help: 'unset',
    labelNames: labels,
});

const gpsRotateGauge = new Gauge({
    name: 'trainnet_gps_deg',
    help: 'unset',
    labelNames: labels,
});

const speedGauge = new Gauge({
    name: 'trainnet_speed',
    help: 'unset',
    labelNames: labels,
});

const totalDelayGauge = new Gauge({
    name: 'trainnet_total_delay',
    help: 'unset',
    labelNames: labels,
});

const tripLabels = [...labels, 'startStation', 'destination'] as const;
const tripGauge = new Gauge({
    name: 'trainnet_trip',
    help: 'unset',
    labelNames: tripLabels,
});

const nextStationProgressLabels = [
    ...labels,
    'nextStation',
    'track',
    'forecast_arrival',
    'scheduled_arrival',
    'forecast_departure',
    'scheduled_departure',
] as const;
const nextStationProgressGauge = new Gauge({
    name: 'trainnet_nextstationprogress',
    help: 'unset',
    labelNames: nextStationProgressLabels,
});

const currentStationLabels = [
    ...labels,
    'currentStation',
    'track',
    'forecast_arrival',
    'scheduled_arrival',
    'forecast_departure',
    'scheduled_departure',
] as const;
const currentStationGauge = new Gauge({
    name: 'trainnet_currentstation',
    help: 'unset',
    labelNames: currentStationLabels,
});

const HTTP_ADDR = process.env.HTTP_ADDR || 'localhost';
const HTTP_PORT = (() => {
    const portStr = process.env.HTTP_PORT || '9042';

    const parsed = Number.parseInt(portStr);

    if (Number.isNaN(parsed)) {
        throw new TypeError('Invalid port specified');
    }

    return parsed;
})();

const importantKeys = ['latestStatus'];

const fetchData = async (): Promise<TrainInfo | null> => {
    try {
        let trainData: TrainInfo;

        if (process.env.USE_TEST_DATA === '1') {
            console.log('Using test data');
            const dataStr = fs.readFileSync(
                'test-data/oebb-trainnet.json',
                'utf8',
            );

            trainData = JSON.parse(dataStr) as TrainInfo;
        } else {
            const res = await fetch(
                'https://railnet.oebb.at/assets/media/fis/combined.json',
            );

            if (!res?.ok) {
                return null;
            }

            const data = (await res.json()) as unknown;

            if (typeof data !== 'object') {
                console.warn(
                    'Got invalid JSON, type did not match',
                    typeof data,
                );
                return null;
            }

            if (data === null) {
                console.warn('Got invalid JSON, data === null');
                return null;
            }

            const dataKeys = Object.keys(data);

            if (!importantKeys.every(key => dataKeys.includes(key))) {
                console.warn('Got invalid JSON, will return null');
                return null;
            }

            trainData = data as TrainInfo;
        }

        const labels: LabelObject = {
            lineNumber: trainData.lineNumber,
            tripNumber: trainData.tripNumber,
            trainType: trainData.trainType,
        };

        gpsLatGauge.set(
            labels,
            Number.parseFloat(
                trainData.latestStatus.gpsPosition?.latitude || '0',
            ),
        );
        gpsLongGauge.set(
            labels,
            Number.parseFloat(
                trainData.latestStatus.gpsPosition?.longitude || '0',
            ),
        );
        gpsRotateGauge.set(
            labels,
            Number.parseFloat(
                trainData.latestStatus.gpsPosition?.orientation || '0',
            ),
        );
        speedGauge.set(labels, trainData.latestStatus.speed);
        totalDelayGauge.set(labels, trainData.latestStatus.totalDelay);
        tripGauge.set(
            {
                ...labels,
                startStation: trainData.startStation,
                destination:
                    trainData.destination.all ||
                    trainData.destination.de ||
                    'unknown',
            },
            1,
        );
        nextStationProgressGauge.set(
            {
                ...labels,
                nextStation:
                    trainData.nextStation.name.all ||
                    trainData.nextStation.name.de ||
                    'unknown',
                forecast_arrival:
                    trainData.nextStation.arrival.forecast || 'unknown',
                scheduled_arrival:
                    trainData.nextStation.arrival.scheduled || 'unknown',
                forecast_departure:
                    trainData.nextStation.departure.forecast || 'unknown',
                scheduled_departure:
                    trainData.nextStation.departure.scheduled || 'unknown',
                track:
                    trainData.nextStation.track.all ||
                    trainData.nextStation.track.de ||
                    'unknown',
            },
            trainData.nextStationProgress,
        );
        currentStationGauge.set(
            {
                ...labels,
                currentStation:
                    trainData.currentStation.name.all ||
                    trainData.currentStation.name.de ||
                    'unknown',
                forecast_arrival:
                    trainData.currentStation.arrival.forecast || 'unknown',
                scheduled_arrival:
                    trainData.currentStation.arrival.scheduled || 'unknown',
                forecast_departure:
                    trainData.currentStation.departure.forecast || 'unknown',
                scheduled_departure:
                    trainData.currentStation.departure.scheduled || 'unknown',
                track:
                    trainData.currentStation.track.all ||
                    trainData.currentStation.track.de ||
                    'unknown',
            },
            1,
        );

        return trainData;
    } catch (error) {
        if (error instanceof SyntaxError) {
            return null;
        }

        console.error('Error fetching train info', error);
        return null;
    }
};

const app = express();

app.get('/', (_req, res) => {
    res.redirect('/metrics');
});

app.get('/metrics', async (req, res) => {
    try {
        console.debug('Fetching metrics...', {
            addr: req.socket.remoteAddress,
        });
        await fetchData();
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
        console.debug('Successfully fetched metrics');
    } catch (error) {
        res.status(500).end(error);
    }
});

app.get('/json', async (req, res) => {
    try {
        console.debug('Fetching metrics as json...', {
            addr: req.socket.remoteAddress,
        });
        const data = await fetchData();

        console.debug('Successfully fetched metrics');

        res.json(data);
    } catch (error) {
        res.status(500).end(error);
    }
});

const main = async () => {
    console.log('Collecting initial data');

    const initialData = await fetchData();

    if (!initialData) {
        console.log(
            'Invalid data found. Are you sure you are connected to the OEBB wifi?',
        );
        process.exit(1);
    }

    app.listen(HTTP_PORT, HTTP_ADDR, error => {
        if (error) {
            console.error(error);
            process.exit(1);
        } else {
            console.log(
                `Successfully listening on http://${HTTP_ADDR}:${HTTP_PORT}`,
            );
        }
    });

    if (process.env.NODE_ENV === 'development') {
        app.listen(HTTP_PORT, 'localhost', error => {
            if (error) {
                console.error(error);
                process.exit(1);
            } else {
                console.log(
                    `Successfully listening on http://localhost:${HTTP_PORT}`,
                );
            }
        });
    }
};

main().catch(error => {
    console.error('Error during exec:', error);
    process.exit(1);
});
