export interface TrainInfo {
    lineNumber: string;
    tripNumber: string;
    trainType: string;
    won: string;
    startStation: string;
    destination: LanguageString;
    stations: Station[];
    latestStatus: LatestStatus;
    currentStation: Station;
    nextStation: Station;
    nextStationProgress: number;
}

export interface LanguageString {
    de?: string;
    all?: string;
}

export interface Station {
    id: string;
    name: LanguageString;
    track: LanguageString;
    departure: Departure;
    arrival: Arrival;
    exitSide: unknown;
    distanceFromPrevious?: number;
    connections?: Connection[];
}

export interface Departure {
    scheduled?: string;
    forecast?: string;
}

export interface Arrival {
    scheduled?: string;
    forecast?: string;
}

export interface Connection {
    type: string;
    lineNumber: string;
    track: LanguageString;
    destination: LanguageString;
    departure: Departure;
    reachable: string;
    comment: unknown;
}

export interface LatestStatus {
    dateTime: string;
    situation: Situation;
    gpsPosition: GpsPosition | null;
    speed: number;
    distance: Distance;
    totalDelay: number;
    comment: unknown;
}

export interface Situation {
    type: string;
    station: string;
}

export interface GpsPosition {
    latitude: string;
    longitude: string;
    orientation: string;
}

export interface Distance {
    meters: number;
    fromStation: string;
}
