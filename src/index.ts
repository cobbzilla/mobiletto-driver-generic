import {
    MobilettoError,
    MobilettoFeatureFlags,
    MobilettoListOptions,
    MobilettoMetadata,
    MobilettoMinimalClient,
    MobilettoOptions,
    MobilettoRemoveOptions,
    MobilettoVisitor,
    MobilettoWriteSource,
    MobilettoDriverInfo,
} from "mobiletto-base";

export type DriverFunc = (key: string, secret?: string, opts?: GenericDriverOpts) => MobilettoMinimalClient;

export type GenericDriverOpts = MobilettoOptions & {
    driver: DriverFunc;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    [prop: string]: any;
    /* eslint-enable @typescript-eslint/no-explicit-any */
};

export class StorageClient {
    readonly driver: MobilettoMinimalClient;
    readonly opts: GenericDriverOpts;
    constructor(driver: DriverFunc, opts: GenericDriverOpts, key?: string, secret?: string) {
        this.driver = opts.driver(key || "", secret, opts);
        this.opts = opts;
    }

    testConfig = async () => this.driver.testConfig();

    info = () => this.driver.info();

    async list(
        pth?: string,
        optsOrRecursive?: MobilettoListOptions | boolean,
        visitor?: MobilettoVisitor
    ): Promise<MobilettoMetadata[]> {
        return this.driver.list(pth, optsOrRecursive, visitor);
    }

    async metadata(path: string): Promise<MobilettoMetadata> {
        return this.driver.metadata(path);
    }

    async read(path: string, callback: (chunk: Buffer) => void, endCallback?: () => void): Promise<number> {
        return this.driver.read(path, callback, endCallback);
    }

    async write(path: string, data: MobilettoWriteSource): Promise<number> {
        return this.driver.write(path, data);
    }

    async remove(
        path: string,
        optsOrRecursive?: MobilettoRemoveOptions | boolean,
        quiet?: boolean
    ): Promise<string | string[]> {
        return this.driver.remove(path, optsOrRecursive, quiet);
    }

    flags(): MobilettoFeatureFlags {
        return typeof this.driver.flags === "function" ? this.driver.flags() : {};
    }
}

export const storageClient = (key?: string, secret?: string, opts?: GenericDriverOpts): MobilettoMinimalClient => {
    if (!opts || !opts.driver || typeof opts.driver !== "function") {
        throw new MobilettoError("generic.storageClient: opts.driver is required and must be a function");
    }
    return new StorageClient(opts.driver, opts, key, secret);
};
