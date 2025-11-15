import type { TrainInfo } from './schema.js';

import express from 'express';
import { Gauge, register } from 'prom-client';

import 'dotenv/config';

const generatedGauges = new Map<string, Gauge>();

function flattenObject(obj: object): object {
    const toReturn = {};

    for (const _objKey of Object.keys(obj)) {
        if (!Object.prototype.hasOwnProperty.call(obj, _objKey)) continue;

        const objKey = _objKey as keyof typeof obj;

        if (typeof obj[objKey] === 'object' && obj[objKey] !== null) {
            const flatObject = flattenObject(obj[objKey]);
            for (const _innerKey of Object.keys(flatObject)) {
                if (
                    !Object.prototype.hasOwnProperty.call(flatObject, _innerKey)
                )
                    continue;

                const innerKey = _innerKey as keyof typeof flatObject;

                toReturn[(objKey + '_' + innerKey) as never] =
                    flatObject[innerKey];
            }
        } else {
            toReturn[objKey] = obj[objKey];
        }
    }
    return toReturn;
}

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

        const foo = flattenObject(trainData.latestStatus);

        for (const key of Object.keys(foo)) {
            try {
                let value = foo[key as never] as unknown;

                if (typeof value === 'string') {
                    const parsed = Number.parseFloat(value);

                    if (Number.isNaN(parsed)) {
                        continue;
                    }

                    value = parsed;
                }

                if (typeof value !== 'number') {
                    continue;
                }

                if (!generatedGauges.has(key)) {
                    generatedGauges.set(
                        key,
                        new Gauge({
                            name: key.toLowerCase(),
                            help: `${key.toLowerCase()}`,
                        }),
                    );
                }

                const gauge = generatedGauges.get(key);

                if (gauge) {
                    gauge.set(value);
                }
            } catch (error) {
                console.log(
                    `Unable to update prometheus metrics key=${key}`,
                    error,
                );
            }
        }

        return trainData;
    } catch (error) {
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
