var bilbo = require("bilbo"),
    environment = require("./environment"),
    logger = require("./logger");

var RedisMetricsController = function() {

    var bag = bilbo.bag(),
        lastInfo = {},
        started = false;

    var DELTA_METRICS= environment.redis.metrics_delta,
        STATIC_METRICS = environment.redis.metrics_static;

    var RedisInfoObserver = bag.grab("RedisInfoObserver"),
        StasdInterface = bag.grab("StasdInterface");

    this.start = function(options) {
        if (!started) {
            var interval = options.interval;

            RedisInfoObserver.init(options.addresses, options.interval, options.auth);
            RedisInfoObserver.onInfo(infoHandler);

            started = true;
            logger.log("info", "RedisMetricsController started");
        }
    };

    var calcRate  = function(newValue, oldValue, interval) {
        return ((newValue - oldValue) / interval) || 0;
    };

    var addRedisAddressToMetricName = function(address, metric) {
        var normalizedAddress = address.replace(/\.|:/g, "-");
        if (environment.metric && environment.metric.format) {
            return environment.metric.format
                .replace("{METRIC}", metric)
                .replace("{REDIS_ADDRESS}", normalizedAddress);
        } else {
            return normalizedAddress + "." + metric;
        }
    };

    var processAndSendData = function(data) {
        var currentInfo = data.info,
            deltaTime = currentInfo["uptime_in_seconds"] - lastInfo[data.address]["uptime_in_seconds"],
            metricsData = {},
            metricName;
        DELTA_METRICS.forEach(function(metric) {
            metricName = addRedisAddressToMetricName(data.address, metric);
            if (currentInfo.hasOwnProperty(metric) && deltaTime > 0) {
                metricsData[metricName.replace(metric, metric + "_per_sec")] = calcRate(currentInfo[metric], lastInfo[data.address][metric], deltaTime);
            }
        });

        STATIC_METRICS.forEach(function(metric) {
            metricName = addRedisAddressToMetricName(data.address, metric);
            if (currentInfo.hasOwnProperty(metric)) {
                metricsData[metricName] = currentInfo[metric];
            }
        });
        StasdInterface.send(metricsData);
        lastInfo[data.address] = data.info;
    };

    var infoHandler = function(err, data) {
        if (!lastInfo.hasOwnProperty(data.address)) {
            lastInfo[data.address] = data.info;
        } else {
            processAndSendData(data);
        }
    };

};

RedisMetricsController["〇"] = "singleton";

module.exports = RedisMetricsController;
