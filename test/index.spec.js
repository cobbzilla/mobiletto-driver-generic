import { describe, it, before, beforeEach, after } from "mocha";
import { expect, should, assert } from "chai";

import {
    MobilettoNotFoundError,
    logger,
    connect,
    mobiletto,
    flushAll,
    registerDriver,
    shutdownMobiletto,
    rand,
} from "mobiletto-base";

import { storageClient as localDriver } from "mobiletto-driver-local";
import { storageClient as genericDriver } from "../lib/esm/index.js";
registerDriver("generic", genericDriver);

// chunk size used by generator function, used by driver's 'write' function
// the temp file is also TEMP_SZ_MULTIPLE of this number
const READ_SZ = 8 * 1024; // xfer data in 8k chunks
const TEMP_SZ_MULTIPLE = 3; // temp file will be ~24k (READ_SZ * 3)

const SINGLE_DRIVER = "local";

const DRIVER_CONFIG = {
    local: {
        key: `/tmp/mobiletto_generic_test_${rand(10)}`,
        opts: {
            driver: localDriver,
            createIfNotExist: true,
        },
    },
};
const DRIVER_NAMES = Object.keys(DRIVER_CONFIG);

async function assertMeta(api, name, expectedSize) {
    const meta = await api.metadata(name);
    should().exist(meta, "expected return value from metadata call");
    expect(meta.name).equals(name, "expected name of written file to be correct");
    expect(meta.size).equals(expectedSize, "expected size of written file to equal size of randomData");
    expect(meta.mtime).is.greaterThan(0, "expected mtime of written file to be > 0");
}

async function assertMetaFail(api, name) {
    try {
        const meta = await api.metadata(name);
        assert.fail(
            `loading metadata after deletion, did not expect to get meta: ${
                meta ? JSON.stringify(meta) : "null or undefined"
            }`
        );
    } catch (err) {
        if (!(err instanceof MobilettoNotFoundError)) {
            // MobilettoNotFoundError is expected
            assert.fail(`loading metadata after deletion, got err: ${err}`);
        }
    }
}

async function assertSafeMetaNull(api, name) {
    try {
        const meta = await api.safeMetadata(name);
        expect(meta).to.be.null;
    } catch (err) {
        assert.fail(`loading metadata with safeMetadata should not throw error: ${err}`);
    }
}

async function writeRandomFile(fixture, size) {
    const data = fixture.randomData;
    function* dataGenerator() {
        // read in 8k chunks
        for (let i = 0; i < data.length; i += size) {
            const end = i + size > data.length ? data.length : i + size;
            yield data.slice(i, end);
        }
    }
    return await fixture.api.write(fixture.name, dataGenerator());
}

const encryptionTests = () => [null, { key: rand(32) }];
// const encryptionTests = () => [null];
// const encryptionTests = () => [{ key: rand(32) }];

const REDIS_ENABLED = {
    name: "redis-enabled",
    enabled: true,
    config: (cfg) => Object.assign({}, cfg),
};
const REDIS_DISABLED = {
    name: "redis-disabled",
    enabled: true,
    config: (cfg) => {
        const newConfig = Object.assign({}, cfg);
        if (!newConfig.opts) {
            newConfig.opts = {};
        }
        if (!newConfig.opts.redisConfig) {
            newConfig.opts.redisConfig = {};
        }
        newConfig.opts.redisConfig.enabled = false;
        return newConfig;
    },
};

const redisTests = () => [REDIS_ENABLED, REDIS_DISABLED];
// const redisTests = () => [REDIS_ENABLED];
// const redisTests = () => [REDIS_DISABLED];

let firstTestRun = true;

for (const redisSetup of redisTests()) {
    if (!redisSetup.enabled) continue;

    for (const driverName of DRIVER_NAMES) {
        // For testing single drivers
        if (SINGLE_DRIVER != null && SINGLE_DRIVER !== driverName) continue;

        const driverTest = `${driverName} [${redisSetup.name}]`;
        const config = redisSetup.config(DRIVER_CONFIG[driverName]);
        const nonexistentFile = "random_file_that_does_not_exist_" + rand(100) + "_" + Date.now();
        // const tempFilename = (name, i) => name + (i > 0 ? "_" + i : "");
        let anyWrites = false;
        describe(`${driverTest} test`, () => {
            beforeEach((done) => {
                anyWrites = false;
                flushAll()
                    .then(
                        () => {
                            logger.info(`${driverTest} - flushed redis`);
                        },
                        (e) => {
                            logger.error(`${driverTest} - error flushing redis: ${e}`);
                            throw e;
                        }
                    )
                    .finally(done);
            });

            describe(`${driverTest} - create api client`, () => {
                it("should validate the config and return an API object", async () => {
                    try {
                        const api = await mobiletto(genericDriver, config.key || "", null, config.opts);
                        should().exist(api, "expected API object to exist");
                    } catch (e) {
                        logger.error(`error creating API: ${e} ${JSON.stringify(e)}`);
                        throw e;
                    }
                });
            });

            describe(`${driverTest} - listing with no arguments returns appropriate results`, () => {
                it("should return appropriate results from a default listing", async () => {
                    const api = await mobiletto(genericDriver, config.key || "", null, config.opts);
                    const results = await api.list();
                    if (firstTestRun || !anyWrites) {
                        firstTestRun = false;
                        expect(results.length).eq(0, "expected no results in the default listing");
                    } else {
                        expect(results.length).gt(0, "expected some results in the default listing");
                    }
                });
                it("should throw MobilettoNotFound when reading metadata for a file that does not exist", async () => {
                    const api = await mobiletto(genericDriver, rand(10), null, config.opts);
                    try {
                        const meta = await api.metadata(`nonexistent/file/notfound_${rand(10)}`);
                        assert.fail(
                            `should not have been able to read metadata for non-existent file, found: ${JSON.stringify(
                                meta
                            )}`
                        );
                    } catch (e) {
                        expect(e).instanceof(MobilettoNotFoundError);
                    }
                });
            });

            describe(`${driverTest} - write a file, read file, read metadata, delete file`, () => {
                // some random data, plus a bit extra
                const size = READ_SZ * TEMP_SZ_MULTIPLE + Math.floor(Math.random() * (READ_SZ / 2));
                const randomData = rand(size);
                const fileSuffix = "" + Date.now();
                let fixture;
                before((done) => {
                    const name = `test_file_${fileSuffix}`;
                    connect(genericDriver, rand(10), null, config.opts)
                        .then((api) => {
                            fixture = { api, name, randomData };
                        })
                        .finally(done);
                });
                it("should write a file", async () => {
                    const response = await writeRandomFile(fixture, size);
                    expect(response).to.equal(size, "expected write API to return correct number of bytes written");
                    anyWrites = true;
                });
                it("should read the file we just wrote", async () => {
                    const data = await fixture.api.readFile(fixture.name);
                    expect(data.length).is.equal(size, "expected read API to return correct number of bytes read");
                    expect(data.toString()).to.equal(
                        fixture.randomData,
                        "expected to read back the same data we wrote"
                    );
                });
                it("should load metadata on the file we just wrote", async () => {
                    await assertMeta(fixture.api, fixture.name, fixture.randomData.length);
                });
                it("should delete the file we just wrote", async () => {
                    const removed = await fixture.api.remove(fixture.name);
                    expect(!!removed).to.be.true;
                });
                it("loading metadata on the file we wrote now fails", async () => {
                    await assertMetaFail(fixture.api, fixture.name);
                });
                it("loading metadata on the file we wrote using safeMeta does not fail but returns null", async () => {
                    await assertSafeMetaNull(fixture.api, fixture.name);
                });
            });

            for (const encryption of encryptionTests()) {
                const encDesc = encryption ? "(with encryption)" : "(without encryption)";
                if (encryption && redisSetup.name !== "redis-enabled" && driverName !== "local") {
                    // encryption without redis is simply too slow, except for local filesystems
                    continue;
                }
                describe(`${driverTest} - ${encDesc} fail to write and delete files in readOnly mode`, () => {
                    // describe(`${driverTest} - ENC fail to write and delete files in readOnly mode`, () => {
                    // const encryption = {key: rand(32)}
                    const size = 16;
                    const randomData = rand(size);
                    const fileSuffix = "" + Date.now();
                    let fixture;
                    before((done) => {
                        const name = `test_file_${fileSuffix}`;
                        const opts = Object.assign({}, config.opts, { readOnly: true });
                        connect(genericDriver, rand(10), null, opts, encryption)
                            .then((api) => {
                                fixture = { api, name, randomData };
                            })
                            .catch((err) => {
                                throw err;
                            })
                            .finally(done);
                    });
                    it("should try to write a file and fail", async () => {
                        const response = await writeRandomFile(fixture, size);
                        expect(response).to.be.false;
                    });
                    it("should fail to read the file we did not write", async () => {
                        try {
                            const data = await fixture.api.readFile(fixture.name);
                            assert.fail(
                                `should not have been able to read non-existent file that we did not write, found data: ${data}`
                            );
                        } catch (e) {
                            if (!(e instanceof MobilettoNotFoundError)) {
                                assert.fail(`unexpected error: ${e} trying to read non-existent file`);
                            }
                        }
                    });
                    it("should fail to load metadata on the file we did not write", async () => {
                        try {
                            await assertMeta(fixture.api, fixture.name, fixture.randomData.length);
                            assert.fail(
                                "should not have been able to read metadata for non-existent file that we did not write"
                            );
                        } catch (e) {
                            if (!(e instanceof MobilettoNotFoundError)) {
                                assert.fail(`unexpected error: ${e} trying to read metadata on non-existent file`);
                            }
                        }
                    });
                    it("should fail to delete the file we did not write", async () => {
                        const removed = await fixture.api.remove(fixture.name);
                        expect(!!removed).to.be.false;
                    });
                });
            }

            describe(`${driverTest} - write an encrypted file, read file, read metadata, delete file`, () => {
                // some random data, plus a bit extra
                const size = READ_SZ * TEMP_SZ_MULTIPLE + Math.floor(Math.random() * (READ_SZ / 2));
                // const randomData = rand(size)
                const randomData = "abcdefghijklmnopqrstuvwxyz";
                const fileSuffix = "" + Date.now();
                const encryptionKey = rand(32);
                let fixture;
                before((done) => {
                    const name = `test_file_${fileSuffix}`;
                    mobiletto(genericDriver, rand(10), null, config.opts, { key: encryptionKey })
                        .then((api) => {
                            fixture = { api, name, randomData };
                        })
                        .catch((err) => {
                            throw err;
                        })
                        .finally(done);
                });
                it("should write an encrypted file", async () => {
                    const bytesWritten = await writeRandomFile(fixture, fixture.randomData.length);
                    expect(bytesWritten).is.equal(
                        fixture.randomData.length,
                        "expected write API to return correct number of bytes written"
                    );
                });
                it("should read the encrypted file we just wrote", async () => {
                    const data = await fixture.api.readFile(fixture.name);
                    expect(data.length).is.equal(
                        fixture.randomData.length,
                        "expected read API to return correct number of bytes read"
                    );
                    expect(data.toString()).to.equal(
                        fixture.randomData,
                        "expected to read back the same data we wrote"
                    );
                });
                it("should load metadata on the encrypted file we just wrote", async () => {
                    try {
                        await assertMeta(fixture.api, fixture.name, fixture.randomData.length);
                    } catch (e) {
                        assert.fail("unexpected error getting metadata: " + e);
                    }
                });
                it("should delete the encrypted file we just wrote", async () => {
                    try {
                        const removed = await fixture.api.remove(fixture.name);
                        expect(!!removed).to.be.true;
                    } catch (e) {
                        expect(e).is.null;
                    }
                });
                it("loading metadata on the encrypted file we wrote now fails", async () => {
                    await assertMetaFail(fixture.api, fixture.name);
                });
            });

            describe(`${driverTest} - expect MobilettoNotFoundError when reading nonexistent file `, () => {
                it("should throw MobilettoNotFoundError when trying to read a file that does not exist", async () => {
                    const api = await mobiletto(genericDriver, rand(10), null, config.opts);
                    try {
                        await api.read(nonexistentFile, () => {
                            assert.fail(`ERROR: reading non-existent file should NOT succeed`);
                        });
                    } catch (err) {
                        expect(err).to.be.instanceof(
                            MobilettoNotFoundError,
                            `expected MobilettoNotFoundError, got: ${err}`
                        );
                    }
                });
            });

            describe(`${driverTest} - expect MobilettoNotFoundError when reading metadata for nonexistent file`, () => {
                it("should throw MobilettoNotFoundError when trying to read metadata for a file that does not exist", async () => {
                    const api = await mobiletto(genericDriver, rand(10), null, config.opts);
                    try {
                        const meta = await api.metadata(nonexistentFile);
                        assert.fail(
                            `ERROR: reading metadata for non-existent file should NOT succeed, but it returned ${
                                meta ? JSON.stringify(meta) : "null or undefined"
                            }`
                        );
                    } catch (err) {
                        expect(err).to.be.instanceof(
                            MobilettoNotFoundError,
                            `expected MobilettoNotFoundError, got: ${err}`
                        );
                    }
                });
            });

            describe(`${driverTest} - expect MobilettoNotFoundError when removing non-existent file`, () => {
                it("should throw MobilettoNotFoundError when trying to remove a file that does not exist", async () => {
                    const api = await mobiletto(genericDriver, rand(10), null, config.opts);
                    try {
                        await api.remove(nonexistentFile);
                        assert.fail("ERROR: removing non-existent file should NOT succeed");
                    } catch (err) {
                        expect(err).to.be.instanceof(
                            MobilettoNotFoundError,
                            `expected MobilettoNotFoundError, got: ${err}`
                        );
                    }
                });
            });

            describe(`${driverTest} - quietly removing non-existent file does not throw MobilettoNotFoundError`, () => {
                it("should NOT throw MobilettoNotFoundError when quietly removing a file that does not exist", async () => {
                    const api = await mobiletto(genericDriver, rand(10), null, config.opts);
                    if (!(await api.remove(nonexistentFile, { quiet: true }))) {
                        assert.fail("ERROR: quietly removing non-existent file should still return true");
                    }
                });
            });
        });
    }
}

after((done) => {
    logger.info("all tests finished, tearing down redis...");
    shutdownMobiletto().finally(done);
});
