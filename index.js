var domain = require("domain");

var wrap = function(fn) {
	return function() {
		var originalDomain = domain.active;
		
		var d = domain.create();
		
		var args = Array.prototype.slice.call(arguments);
		var cb = args.pop();
		
		var newCb = function() {
			d.exit();
			
			// we need to re-enter an old domain by calling run, if there is no old domain, we mock it
			var temp = originalDomain || { run : function(cb) { cb(null); } };
			
			var returnArgs = arguments;
			
			temp.run(function() {
				// need to bounce off the event loop for the exit domain to take place
				process.nextTick(function() {
					cb.apply(null, returnArgs);
				});
			});
		}
		
		args.push(newCb);
		d.on("error", newCb);
		
		d.run(function() {
			process.nextTick(function() {
				fn.apply(null, args);
			});
		});
	}
}


var run = function(fn, catchFn, afterFn) {
	afterFn = afterFn || catchFn;
	catchFn = catchFn || afterFn;
	
	var fnResult;
	
	var newFn = function(cb) {
		fn(function() {
			fnResult = arguments;
			
			cb(null);
		});
	}
	
	var wrapped = wrap(newFn);
	wrapped(function(err) {
		if (err) {
			return catchFn(err, afterFn);
		} else {
			return afterFn.apply(null, fnResult);
		}
	});
}

var tryCatch = function(fn, catchFn) {
	run(fn, catchFn, function() {});
}

var bind = function(fn) {
	if (domain.active) {
		return domain.active.bind(function() {
			var args = Array.prototype.slice.call(arguments);
			process.nextTick(function() {
				fn.apply(null, args);
			});
		});
	}
	
	return fn;
}

module.exports = {
	bind : bind,
	wrap : wrap,
	run : run,
	tryCatch : tryCatch
}