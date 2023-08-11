/// <reference types="node" />
import { MobilettoFeatureFlags, MobilettoListOptions, MobilettoMetadata, MobilettoMinimalClient, MobilettoOptions, MobilettoRemoveOptions, MobilettoVisitor, MobilettoWriteSource, MobilettoDriverInfo } from "mobiletto-base";
export type DriverFunc = (key: string, secret?: string, opts?: GenericDriverOpts) => MobilettoMinimalClient;
export type GenericDriverOpts = MobilettoOptions & {
    driver: DriverFunc;
    [prop: string]: any;
};
export declare class StorageClient {
    readonly driver: MobilettoMinimalClient;
    readonly opts: GenericDriverOpts;
    constructor(driver: DriverFunc, opts: GenericDriverOpts, key?: string, secret?: string);
    testConfig: () => Promise<unknown>;
    info: () => MobilettoDriverInfo;
    list(pth?: string, optsOrRecursive?: MobilettoListOptions | boolean, visitor?: MobilettoVisitor): Promise<MobilettoMetadata[]>;
    metadata(path: string): Promise<MobilettoMetadata>;
    read(path: string, callback: (chunk: Buffer) => void, endCallback?: () => void): Promise<number>;
    write(path: string, data: MobilettoWriteSource): Promise<number>;
    remove(path: string, optsOrRecursive?: MobilettoRemoveOptions | boolean, quiet?: boolean): Promise<string | string[]>;
    flags(): MobilettoFeatureFlags;
}
export declare const storageClient: (key?: string, secret?: string, opts?: GenericDriverOpts) => MobilettoMinimalClient;
