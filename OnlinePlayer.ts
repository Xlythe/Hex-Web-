
import { LoggedInUser, IgCommandHandlerResponse, IgCommandHandlerSuccessResponse, IgCommandHandlerFullParams, IgGameEvent } from './types';
import { api } from './api'; // Import the shared API instance
import { APP_ID, APP_CODE } from './IgGameCenterApi'; 

/**
 * @class OnlinePlayer
 * @description Represents an online opponent in the Hex game.
 * This class manages session information and sends commands to the game server.
 */
export class OnlinePlayer {
  private name: string;
  private commandQueue: Promise<void> = Promise.resolve();
  public sid: string | null = null;
  public server: string | null = null; // This will store just the server name, e.g., "gc1"
  public lastEventId: string = "0"; // ID of the last event received for this board session

  /**
   * @constructor
   * @param {string} name - The display name for the online opponent.
   */
  constructor(name: string) {
    this.name = name;
  }

  /**
   * Sets the session information for the online game.
   * @param sid The session ID for the game board.
   * @param server The server prefix for game communication (e.g., "gc1").
   */
  public setSessionInfo(sid: string, server: string): void {
    this.sid = sid;
    this.server = server; // Store just the server name
    this.lastEventId = "0"; // Reset lastEventId for a new session
  }

  /**
   * Clears the current online game session information.
   */
  public clearSessionInfo(): void {
    this.sid = null;
    this.server = null;
    this.lastEventId = "0";
  }

  /**
   * Sends a command to the game server via `api_handler.php`.
   * @param command The command string (e.g., "JOIN", "MOVE", "REFRESH").
   * @param loggedInUser The currently logged-in user's details.
   * @param additionalParams Optional command-specific parameters (e.g., { move: "A1" }).
   * @returns A promise resolving to the parsed server response.
   */
  public async sendCommand(
    command: string | null,
    loggedInUser: LoggedInUser,
    additionalParams?: Record<string, string>
  ): Promise<IgCommandHandlerResponse> {
    const queuedCommand = this.commandQueue.then(() =>
      this.executeCommand(command, loggedInUser, additionalParams)
    );
    this.commandQueue = queuedCommand.then(() => undefined, () => undefined);
    return queuedCommand;
  }

  private async executeCommand(
    command: string | null,
    loggedInUser: LoggedInUser,
    additionalParams?: Record<string, string>
  ): Promise<IgCommandHandlerResponse> {
    if (!this.sid || !this.server) {
      console.error("OnlinePlayer: Cannot send command, session not initialized (sid or server name missing).");
      return { error: true, message: "Client-side error: Online session not initialized." };
    }
    if (!loggedInUser) {
        console.error("OnlinePlayer: Cannot send command, user not logged in.");
        return { error: true, message: "Client-side error: User not logged in." };
    }

    const commandParams: IgCommandHandlerFullParams = {
      app_id: APP_ID,
      app_code: APP_CODE,
      uid: loggedInUser.uid,
      session_id: loggedInUser.session_id,
      sid: this.sid,
      ...additionalParams,
      // Resolve this at execution time so queued commands never send a stale EID.
      lasteid: this.lastEventId,
    };
    if (command) commandParams.cmd = command;

    const response = await api.handleGameCommand(commandParams, this.server);

    if (!response.error) {
      const successResponse = response as IgCommandHandlerSuccessResponse;
      if (successResponse.eventList && successResponse.eventList.length > 0) {
        let maxEidNum = parseInt(this.lastEventId, 10);
        let newEventsReceived = false;
        for (const event of successResponse.eventList) {
          const currentEventEidNum = parseInt(event.eid, 10);
          if (currentEventEidNum > maxEidNum) {
            maxEidNum = currentEventEidNum;
            newEventsReceived = true;
          }
        }
        if (newEventsReceived) {
          this.lastEventId = String(maxEidNum);
          // console.log(`OnlinePlayer: Updated lastEventId to ${this.lastEventId} after command '${command}'`);
        }
      }
    }
    return response;
  }


  /**
   * @method getName
   * @description Returns the name of the online player.
   * @returns {string} The online player's name.
   */
  public getName(): string {
    return this.name;
  }
}
