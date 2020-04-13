import { handlePokerEvent } from "../domain/handlePokerEvent";
import { Command } from "../domain/commandTypes";
import {
  ParticipantRepository,
  RoomRepository,
  MessageSender,
} from "../repositories/types";
import { queryRoomState } from "../cqrs/queryRoomState";
import { handleCommand } from "../cqrs/handleCommand";

export default class PokerEventInteractor {
  private queryRoomState: queryRoomState;
  private handleCommand: handleCommand;

  constructor(
    private participantRepository: ParticipantRepository,
    roomRepository: RoomRepository,
    messageSender: MessageSender
  ) {
    this.queryRoomState = queryRoomState(roomRepository, participantRepository);
    this.handleCommand = handleCommand(
      roomRepository,
      participantRepository,
      messageSender
    );
  }

  public async handleIncomingEvent(
    pokerEvent: PokerEvent,
    connectionId: string
  ) {
    const participantInfo = await this.participantRepository.fetchParticipantInfo(
      connectionId
    );

    const roomNameFromJoinRoomEvent =
      pokerEvent.eventType === "joinRoom" ? pokerEvent.roomName : undefined;

    const roomName = participantInfo?.roomName || roomNameFromJoinRoomEvent;

    if (!roomName) {
      throw Error(`Participant with id ${connectionId} could not be found.`);
    }

    const room = await this.queryRoomState(roomName);
    const commands = handlePokerEvent(
      room,
      pokerEvent,
      connectionId,
      participantInfo?.participant
    );
    await this.processCommandsSequentially(commands, roomName);
  }

  public async handleUserLeft(participantId: string) {
    const participantInfo = await this.participantRepository.fetchParticipantInfo(
      participantId
    );

    if (!participantInfo) {
      throw Error(
        `Participant with connectionId ${participantId} was not found when handling disconnection.`
      );
    }

    const { participant, roomName } = participantInfo;
    const userLeftEvent: UserLeft = {
      eventType: "userLeft",
      userName: participant.name,
    };

    const room = await this.queryRoomState(roomName);
    const commands = handlePokerEvent(
      room,
      userLeftEvent,
      participant.id,
      participant
    );
    await this.processCommandsSequentially(commands, roomName);
  }

  private async processCommandsSequentially(
    commands: Command[],
    roomName: string
  ): Promise<void> {
    // Make sure commands are processed sequentially:
    return commands.reduce(async (previousPromise, nextCommand) => {
      await previousPromise;

      const pokerRoom = await this.queryRoomState(roomName);
      return this.handleCommand(nextCommand, pokerRoom);
    }, Promise.resolve());
  }
}