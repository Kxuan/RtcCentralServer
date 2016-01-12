var assert = require('assert');
describe('Events', function () {
    require('../public/js/events.js');
    var EventEmitter = global.EventEmitter;
    it("should register in global", function () {
        assert.strictEqual(typeof EventEmitter, "function");
    });
    describe("#bindPrototype", function () {
        it("bind to function", function () {
            var testCtor = function () {
            };
            EventEmitter.bindPrototype(testCtor);
            var test = new testCtor();
            assert.equal(typeof test.on, 'function');
            assert.equal(typeof test.off, 'function');
            assert.equal(typeof test.once, 'function');
            assert.equal(typeof test.emit, 'function');
        });
    });

    describe("#on", function () {
        var testCtor = function () {
        };
        EventEmitter.bindPrototype(testCtor);

        it("#on", function () {
            var testObj = new testCtor();
            var count_test = 0, count_another = 0;
            var test_a1 = testObj, test_a2, test_a3 = Math.random();

            testObj.on("another", function () {
                count_another++;
            });
            testObj.on("test", function (a1, a2, a3, a4) {
                assert.strictEqual(a1, test_a1);
                assert.strictEqual(a2, test_a2);
                assert.strictEqual(a3, test_a3);
                assert.strictEqual(a4, undefined);
                count_test++;
            });

            testObj.emit("test", test_a1, test_a2, test_a3);
            testObj.emit("another");
            testObj.emit("test", test_a1, test_a2, test_a3);
            assert.equal(count_test, 2);
            assert.equal(count_another, 1);
        });

        it("#once", function () {
            var testObj = new testCtor();
            var count_test = 0;

            testObj.once("test", function () {
                count_test++;
            });

            testObj.emit("test");
            testObj.emit("test");
            assert.equal(count_test, 1);
        });
    });
    describe("#off", function () {
        var testCtor = function () {
        };
        EventEmitter.bindPrototype(testCtor);

        it("#off", function () {
            var testObj = new testCtor();
            var count_test     = 0,
                count_name     = 0,
                count_function = 0;

            var test_handler;
            testObj.on("test", function () {
                count_test++;
            });
            testObj.on("testWithName", function () {
                count_name++;
            });
            testObj.on("testWithFunction", test_handler = function () {
                count_function++;
            });

            testObj.emit("test");
            testObj.emit("testWithName");
            testObj.emit("testWithFunction");
            assert.equal(count_test, 1);
            assert.equal(count_name, 1);
            assert.equal(count_function, 1);

            testObj.off('testWithName', test_handler);
            testObj.emit("test");
            testObj.emit("testWithName");
            testObj.emit("testWithFunction");
            assert.equal(count_test, 2);
            assert.equal(count_name, 2);
            assert.equal(count_function, 2);

            testObj.off('testWithFunction', test_handler);
            testObj.emit("test");
            testObj.emit("testWithName");
            testObj.emit("testWithFunction");
            assert.equal(count_test, 3);
            assert.equal(count_name, 3);
            assert.equal(count_function, 2);

            testObj.off('testWithName');
            testObj.emit("test");
            testObj.emit("testWithName");
            testObj.emit("testWithFunction");
            assert.equal(count_test, 4);
            assert.equal(count_name, 3);
            assert.equal(count_function, 2);
        })
    })
});