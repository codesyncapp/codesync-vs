const express = jest.fn(() => ({
        use: jest.fn(),
        listen: jest.fn(),
        get: jest.fn(),
    })
);
module.exports = express;
