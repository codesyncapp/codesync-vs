const client = jest.fn(() => ({
    connect: jest.fn(),
    on: jest.fn(),
}));

module.exports = {
    client
};
