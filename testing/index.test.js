var assert = require("assert");
var domain = require("domain");
var events = require("events");

var async = require("async");

var domainLib = require("../index.js");

describe(__filename, function() {
	// ensure we test didn't hang a domain, if we assert then the domain will catch it so we have to check normally
	var assertDomainsExited = function() {
		if ((domain.active !== undefined && domain.active !== null) || domain._stack.length !== 0) {
			while(domain.active) {
				domain.active.exit();
			}
			
			throw new Error("Domain left on the stack");
		}
	}
	
	describe("wrap", function() {
		it("should wrap and pass along args", function(done) {
			var test0 = function(cb) {
				cb(null);
			}
			
			var test1 = function(arg1, cb) {
				cb(null, arg1);
			}
			
			var test2 = function(arg1, arg2, cb) {
				cb(null, arg1, arg2);
			}
			
			async.series([
				function(cb) {
					domainLib.wrap(test0)(function(err) {
						assert.ifError(err);
						
						assert.strictEqual(domain.active, undefined);
						
						cb(null);
					});
				},
				function(cb) {
					domainLib.wrap(test1)("foo1", function(err, arg1) {
						assert.ifError(err);
						
						assert.equal(arg1, "foo1");
						assert.strictEqual(domain.active, undefined);
						
						cb(null);
					});
				},
				function(cb) {
					domainLib.wrap(test2)("foo1", "foo2", function(err, arg1, arg2) {
						assert.ifError(err);
						
						assert.equal(arg1, "foo1");
						assert.equal(arg2, "foo2");
						assert.strictEqual(domain.active, undefined);
						
						cb(null);
					})
				}
			], function(err) {
				assert.ifError(err);
				
				done();
			});
		});
		
		it("should handle sync errors", function(done) {
			var test = function(arg1, cb) {
				throw new Error("fail");
			}
			
			domainLib.wrap(test)("foo", function(err) {
				assert.equal(err.message, "fail");
				assert.strictEqual(domain.active, null);
				
				done();
			});
		});
		
		it("should handle async errors", function(done) {
			var test = function(arg1, cb) {
				setTimeout(function() {
					throw new Error("fail");
				}, 5);
			}
			
			domainLib.wrap(test)("foo", function(err) {
				assert.equal(err.message, "fail");
				assert.strictEqual(domain.active, null);
				
				done();
			});
		});
		
		it("should properly exit the domain allowing new errors to be thrown", function(done) {
			var test = function(arg1, cb) {
				throw new Error("fail");
			}
			
			// remove mocha's listeners allowing us to do it
			var listeners = process.listeners("uncaughtException");
			process.removeAllListeners("uncaughtException");
			
			process.once("uncaughtException", function(err) {
				assert.equal(err.message, "success");
				
				// rebind mocha's listeners
				listeners.forEach(function(val, i) {
					process.on("uncaughtException", val);
				});
				
				done();
			});
			
			domainLib.wrap(test)("foo", function(err) {
				assert.equal(err.message, "fail");
				assert.strictEqual(domain.active, null);
				
				// this seems crazy but if the inner-workings of domainLib.wrap aren't correct
				// then throwing another error would cause the FIRST error to be propagated, this ensures that isn't the case
				throw new Error("success");
			});
		});
		
		it("should properly exit the domain allowing nested domain to catch", function(done) {
			var d = domain.create();
			
			var test = function(arg1, cb) {
				throw new Error("fail");
			}
			
			d.on("error", function(err) {
				d.exit();
				assert.equal(err.message, "success");
				process.nextTick(function(){
					done();
				});
			});
			
			d.run(function() {
				setImmediate(function() {
					domainLib.wrap(test)("foo", function(err) {
						assert.equal(err.message, "fail");
						assert.equal(domain.active, d);
						
						throw new Error("success");
					});
				});
			});
		});
		
		it("should handle wrap after wrap", function(done) {
			var crunchwrap = function(arg1, cb) {
				cb(null, "success crunchwrap");
			};
			
			var supreme = function(arg1, cb) {
				throw new Error("fail supreme");
			};
			
			domainLib.wrap(crunchwrap)("foo", function(err, html) {
				assert.ifError(err);
				assert.equal(html, "success crunchwrap");
				
				domainLib.wrap(supreme)("foo", function(err) {
					assert.strictEqual(domain.active, null);
					assert.equal(err.message, "fail supreme");
					
					done();
				});
			});
		});
		
		it("should handle wrap inside wrap", function(done) {
			var outer = function(arg1, cb) {
				var d = domain.active;
				
				var interior = function(arg2, cb) {
					throw new Error("interior1");
				}
				
				var wrapped = domainLib.wrap(interior);
				wrapped("bar", function(err, data) {
					assert.equal(domain.active, d);
					
					cb(err, data);
				});
			}
			
			var wrapped = domainLib.wrap(outer);
			wrapped("foo", function(err, data) {
				assert.equal(err.message, "interior1");
				assert.strictEqual(domain.active, undefined);
				done();
			});
		});
		
		it("should not leak domains", function(done) {
			var foo = function(cb) {
				cb(null, "foo");
			}
			
			var bar = function(cb) {
				var wrapped = domainLib.wrap(foo);
				wrapped(cb);
			}
			
			var baz = function(cb) {
				var wrapped = domainLib.wrap(bar);
				wrapped(cb);
			}
			
			baz(function() {
				assertDomainsExited();
				
				done();
			});
		});
	});
	
	describe("run", function() {
		it("should catch sync error", function(done) {
			domainLib.run(function(cb) {
				throw new Error("success");
			}, function(err) {
				assert.equal(err.message, "success");
				assert.strictEqual(domain.active, null);
				
				done();
			});
		});
		
		it("should catch async error", function(done) {
			domainLib.run(function(cb) {
				process.nextTick(function() {
					throw new Error("success");
				});
			}, function(err) {
				assert.equal(err.message, "success");
				assert.strictEqual(domain.active, null);
				
				done();
			});
		});
		
		it("should return function values", function(done) {
			domainLib.run(function(cb) {
				cb(new Error("success"), "arg1", "arg2");
			}, function(err, arg1, arg2) {
				assert.equal(err.message, "success");
				assert.equal(arg1, "arg1");
				assert.equal(arg2, "arg2");
				assert.strictEqual(domain.active, undefined);
				
				done();
			});
		});
		
		it("should allow catch fn", function(done) {
			domainLib.run(function(cb) {
				throw new Error("success");
			}, function(err, cb) {
				assert.equal(err.message, "success");
				assert.strictEqual(domain.active, null);
				
				cb(null, "arg1", "arg2");
			}, function(err, arg1, arg2) {
				assert.ifError(err);
				
				assert.equal(arg1, "arg1");
				assert.equal(arg2, "arg2");
				assert.strictEqual(domain.active, null);
				
				done();
			});
		});
	});
	
	describe("tryCatch", function() {
		it("should catch sync error", function(done) {
			domainLib.tryCatch(function(){
				throw new Error("success");
			}, function(err) {
				assert.equal(err.message, "success");
				assert.strictEqual(domain.active, null);
				
				done();
			});
		});
		
		it("should catch async error", function(done) {
			domainLib.tryCatch(function(){
				setTimeout(function() {
					throw new Error("success");
				}, 5);
			}, function(err) {
				assert.equal(err.message, "success");
				assert.strictEqual(domain.active, null);
				
				done();
			});
		});
		
		it("should remain in domain if cb'd out", function(done) {
			var cb = function(err, data) {
				assert.ifError(err);
				assert.equal(data, "data");
				assert.notEqual(domain.active, undefined);
				
				domain.active.exit();
				
				done();
			}
			
			domainLib.tryCatch(function() {
				cb(null, "data");
			}, function(err) {
				throw new Error("show not get here");
			});
		});
	});
	
	describe("bindListener", function() {
		it("should bind listener", function(done) {
			var ee = new events.EventEmitter();
			
			var c1 = 0;
			var c2 = 0;
			var c3 = 0;
			var d1;
			var d3;
			
			domainLib.run(function() {
				d1 = domain.active;
				ee.on("test", domainLib.bind(function() {
					throw new Error("one");
				}));
			}, function(err) {
				assert.strictEqual(domain.active, undefined);
				assert.strictEqual(err.message, "one");
				c1++;
			});
			
			domainLib.run(function() {
				ee.on("test", domainLib.bind(function() {
					throw new Error("two");
				}));
			}, function(err) {
				assert.strictEqual(domain.active, undefined);
				assert.strictEqual(err.message, "two");
				c2++;
			});
			
			domainLib.run(function() {
				d3 = domain.active;
				ee.on("test", domainLib.bind(function() {
					setTimeout(function() {
						throw new Error("three");
					}, 10);
				}));
			}, function(err) {
				assert.strictEqual(domain.active, null);
				assert.strictEqual(err.message, "three");
				c3++;
			});
			
			// wait a bit for all of the listeners to queue
			setTimeout(function() {
				// call without a domain bound
				assert.strictEqual(domain.active, undefined);
				ee.emit("test");
				
				setTimeout(function() {
					assert.strictEqual(c1, 1);
					assert.strictEqual(c2, 1);
					assert.strictEqual(c3, 1);
					
					// call with a domain
					domainLib.run(function(cb) {
						assert.strictEqual(domain.active instanceof domain.Domain, true);
						ee.emit("test");
						
						// wait for the handlers to do their thing
						setTimeout(function() {
							cb(null);
						}, 20);
					}, function(err) {
						assert.ifError(err);
						
						assert.strictEqual(c1, 2);
						assert.strictEqual(c2, 2);
						assert.strictEqual(c3, 2);
						
						assert.strictEqual(domain.active, undefined);
						
						done();
					});
				}, 20);
			}, 10);
		});
	});
	
	afterEach(function(done) {
		assertDomainsExited();
		
		done();
	});
});