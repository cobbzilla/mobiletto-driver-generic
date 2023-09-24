var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { MobilettoError, } from "mobiletto-base";
export class StorageClient {
    constructor(driver, opts, key, secret) {
        this.testConfig = () => __awaiter(this, void 0, void 0, function* () { return this.driver.testConfig(); });
        this.info = () => this.driver.info();
        this.driver = opts.driver(key || "", secret, opts);
        this.opts = opts;
    }
    list(pth, optsOrRecursive, visitor) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.driver.list(pth, optsOrRecursive, visitor);
        });
    }
    metadata(path) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.driver.metadata(path);
        });
    }
    read(path, callback, endCallback) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.driver.read(path, callback, endCallback);
        });
    }
    write(path, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.driver.write(path, data);
        });
    }
    remove(path, optsOrRecursive, quiet) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.driver.remove(path, optsOrRecursive, quiet);
        });
    }
    flags() {
        return typeof this.driver.flags === "function" ? this.driver.flags() : {};
    }
}
export const storageClient = (key, secret, opts) => {
    if (!opts || !opts.driver || typeof opts.driver !== "function") {
        throw new MobilettoError("generic.storageClient: opts.driver is required and must be a function");
    }
    return new StorageClient(opts.driver, opts, key, secret);
};
//# sourceMappingURL=index.js.map