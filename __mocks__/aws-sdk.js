const AWS = {
    CloudWatchLogs: jest.fn(() => ({
        putLogEvents: jest.fn()
    })),
};

module.exports = AWS;
