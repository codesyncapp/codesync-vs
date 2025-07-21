import { Logging } from "@google-cloud/logging";
import {
  putLogEvent,
  logErrorMsgTypes,
} from "../../src/utils/logging_service/gcp_logging";
import { UserState } from "../../src/utils/user_utils";
import * as macaddress from "macaddress";

// Mocks
jest.mock("@google-cloud/logging");
jest.mock("../../src/utils/user_utils");
jest.mock("macaddress", () => ({
  one: jest.fn(() => Promise.resolve("00:11:22:33:44:55")),
}));

// Constants
const mockLog = {
  entry: jest.fn(),
  write: jest.fn(),
};
const mockLoggingInstance = {
  log: jest.fn(() => mockLog),
};

const userEmail = "test@codesync.com";

describe("putLogEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    UserState.mockImplementation(() => ({
      getUser: () => ({ email: userEmail }),
    }));

    Logging.mockImplementation(() => mockLoggingInstance);
  });

  it("should log event successfully", async () => {
    const info = {
      projectId: "test-project",
      clientEmail: "client@test.com",
      privateKey: "some\\nkey",
      userEmail,
    };

    const message = "This is a test log";
    const severity = logErrorMsgTypes.INFO;

    mockLog.entry.mockReturnValue("mockEntry");

    await putLogEvent(message, severity, "Extra details", info);

    expect(Logging).toHaveBeenCalledWith({
      projectId: "test-project",
      credentials: {
        client_email: "client@test.com",
        private_key: "some\nkey",
      },
    });

    expect(mockLoggingInstance.log).toHaveBeenCalledWith("vs-code");

    expect(mockLog.entry).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: { type: "global" },
        severity: severity,
        labels: {
          email: userEmail,
          type: severity,
        },
      }),
      expect.objectContaining({
        msg: `${message}, Extra details`,
        type: severity,
        source: expect.any(String),
        version: expect.any(String),
        platform: expect.any(String),
        mac_address: "00:11:22:33:44:55",
        timestamp: expect.any(String),
      })
    );

    expect(mockLog.write).toHaveBeenCalledWith("mockEntry");
  });

  it("should handle logging error", async () => {
    const info = {
      projectId: "test-project",
      clientEmail: "client@test.com",
      privateKey: "some\\nkey",
      userEmail,
    };

    mockLog.entry.mockReturnValue("mockEntry");
    mockLog.write.mockRejectedValue(new Error("Failed"));

    // const consoleErrorSpy = jest
    //   .spyOn(console, "error")
    //   .mockImplementation(() => {});

    const consoleErrorSpy = jest
      // eslint-disable-next-line no-undef
      .spyOn(global.console, "error")
      .mockImplementation(() => {});

    await putLogEvent("msg", logErrorMsgTypes.ERROR, "", info);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "❌ Failed to log to GCP:",
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});
