const AWS = {
    CloudWatchLogsClient: jest.fn(() => ({
        send: jest.fn(),
        config: {
            accessKeyId: jest.fn()
        }
    })),
    PutLogEventsCommand: jest.fn(() => ({
    })),
};

module.exports = AWS;
