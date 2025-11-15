import type { TrainInfo } from './schema.js';

import express from 'express';
import { Gauge, register } from 'prom-client';

import 'dotenv/config';

export const labels = ['lineNumber', 'tripNumber', 'trainType'] as const;

export type LabelObject = Record<(typeof labels)[number], string>;

// gauges
const gpsGauge = new Gauge({
    name: 'trainnet_gps_coords',
    help: 'unset',
    labelNames: [...labels, 'lat', 'long', 'rotate'],
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
        const res = await fetch(
            'https://railnet.oebb.at/assets/media/fis/combined.json',
        );

        if (!res?.ok) {
            return null;
        }

        const data = (await res.json()) as unknown;

        if (typeof data !== 'object') {
            console.warn('Got invalid JSON, type did not match', typeof data);
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

        const trainData = data as TrainInfo;

        const labels: LabelObject = {
            lineNumber: trainData.lineNumber,
            tripNumber: trainData.tripNumber,
            trainType: trainData.trainType,
        };

        gpsGauge.set(
            {
                ...labels,
                lat: Number.parseFloat(
                    trainData.latestStatus.gpsPosition.latitude,
                ),
                long: Number.parseFloat(
                    trainData.latestStatus.gpsPosition.longitude,
                ),
                rotate: Number.parseFloat(
                    trainData.latestStatus.gpsPosition.orientation,
                ),
            },
            0,
        );
        speedGauge.set(labels, trainData.latestStatus.speed);
        totalDelayGauge.set(labels, trainData.latestStatus.totalDelay);

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

app.get('/metrics', async (_req, res) => {
    try {
        await fetchData();
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
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
