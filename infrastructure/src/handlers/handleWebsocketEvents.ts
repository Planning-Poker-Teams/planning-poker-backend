import { PokerRepository } from "../poker/PokerRepository";
import { ApiGatewayManagementClient } from "../ApiGatewayManagementClient";
import { buildLogger } from "../buildLogger";
import { convertToPokerEvent } from "../poker/convertToPokerEvent";

/**
 * Each incoming message sent through a websocket connection (MESSAGE). If a user
 * connects or disconnects (CONNECT/DISCONNECT) body will be empty.
 *
 * `connectionId` is used to send message back to the connected user
 */
export interface APIGatewayWebsocketInvocationRequest {
  requestContext: {
    connectionId: string;
    eventType: "CONNECT" | "MESSAGE" | "DISCONNECT";
    connectedAt: number;
    requestTimeEpoch: number;
    requestId: string;
    apiId: string;
    domainName: string;
    stage: string;
  };
  queryStringParameters?: {
    [key: string]: string;
  };
  multiValueQueryStringParameters?: any;
  body?: any;
  isBase64Encoded: boolean;
}

/**
 * Expected Lambda response for API Gateway.
 */
interface LambdaResponse {
  isBase64Encoded: boolean;
  statusCode: number;
  headers: object;
  body: string; // stringified JSON
}

const { PARTICIPANTS_TABLE, ROOMS_TABLE } = process.env;
const repository = new PokerRepository(
  PARTICIPANTS_TABLE ?? "unknown",
  ROOMS_TABLE ?? "unknown"
);

export const handler = async (
  event: APIGatewayWebsocketInvocationRequest
): Promise<LambdaResponse> => {
  const { connectionId, requestId, domainName, stage } = event.requestContext;

  const log = buildLogger(connectionId, requestId);
  const gatewayClient = new ApiGatewayManagementClient(
    `${domainName}/${stage}`
  );

  // Verify that all request parameters have been set:
  if (event.requestContext.eventType == "CONNECT") {
    const { room, name, isSpectator } = event.queryStringParameters ?? {};
    if (!room || !name) {
      return {
        isBase64Encoded: false,
        headers: {},
        statusCode: 400,
        body: "Missing mandatory query parameters: room, name"
      };
    }
  }

  try {
    await convertToPokerEvent(event, gatewayClient, repository, log);
  } catch (error) {
    log("Unexpected error" + error);
    return {
      isBase64Encoded: false,
      headers: {},
      statusCode: 500,
      body: "Unexpected error while handling event"
    };
  }

  return {
    isBase64Encoded: false,
    statusCode: 200,
    headers: {},
    body: ""
  };
};
