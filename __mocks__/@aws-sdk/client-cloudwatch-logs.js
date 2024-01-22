const AWS = {
    CloudWatchLogsClient: jest.fn(() => ({
        send: jest.fn(),
        config: {
            credentials: jest.fn(() => ({
                accessKeyId: "",
                secretAccessKey: ""
            }))
        }
    })),
    PutLogEventsCommand: jest.fn(() => ({
    })),
};

module.exports = AWS;
