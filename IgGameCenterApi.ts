import {
  // --- User Management Types ---
  IgUserRegistrationParams, IgUserLoginParams,
  IgUserRegistrationSuccessResponse, IgUserLoginSuccessResponse, IgUserRegistrationError,
  IgApiResponse,
  IgUserProfileParams, IgUserProfileData, IgGameStatEntry, IgGameLogPlayer, IgGameLogEntry,
  IgUserUpdateParams, IgUserUpdateSuccessResponse,

  // --- Game & Session Types ---
  IgJoinRandomGameParams, IgJoinRandomGameResponse, // IgJoinRandomGameSuccessResponse is part of IgJoinRandomGameResponse union
  IgCommandHandlerFullParams, IgCommandHandlerResponse, IgCommandHandlerSuccessResponse, PlayerStat, IgGameEvent,
  LobbyGameSession, IgLobbyApiParams, IgLobbyResponse, IgLobbySuccessResponse, LobbyGameSessionMember, // Added LobbyGameSessionMember
  IgCreateBoardParams, IgCreateBoardResponse, IgCreateBoardSuccessResponse // Added Create Board types
} from './types'; // Import various type definitions for API requests and responses.
import { getOrGenerateNetworkUid, md5 } from './utils'; // Utility functions for generating network UID and MD5 hashing.

/**
 * Application ID specific to this game/application on the igGameCenter platform.
 * This is a constant provided by igGameCenter.
 */
export const APP_ID = '17';

/**
 * Application Code specific to this game/application on the igGameCenter platform.
 * This is a secret or semi-secret code also provided by igGameCenter, used for basic API authentication.
 */
export const APP_CODE = 'wihamo8984';

/**
 * Base URL for the igGameCenter API endpoints related to user management and general services.
 * Game-specific commands might use different server URLs.
 * 
 * Original URL: https://www.iggamecenter.com
 */
const API_BASE_URL = 'https://ig-game-center-proxy-12702774477.us-west1.run.app';

/**
 * Template for constructing game server URLs. The `{serverName}` placeholder
 * will be replaced with the specific game server identifier (e.g., "gc1").
 * 
 * Original URL: https://www.iggamecenter.com
 */
const API_SERVER_URL_TEMPLATE = 'https://ig-game-center-proxy-12702774477.us-west1.run.app/server/{serverName}';


/**
 * @class IgGameCenterApi
 * @description Provides methods to interact with the igGameCenter backend services.
 * This class encapsulates the logic for making API calls, handling request parameters,
 * and parsing XML responses for user registration, login, profile management,
 * and game-related commands. All API interactions are asynchronous.
 */
export class IgGameCenterApi {
  /**
   * Registers a new user with the igGameCenter platform.
   *
   * The method constructs a POST request with form-urlencoded data, including
   * common parameters like `app_id`, `app_code`, a unique `networkuid`, and
   * user-provided registration details.
   * It then parses the XML response from the server.
   *
   * @param params - An object containing user registration details such as login (username),
   *                 password, email, etc. The `networkuid` is handled internally.
   * @returns A promise that resolves to an `IgApiResponse`.
   *          If successful, it's an `IgUserRegistrationSuccessResponse` containing `uid`, `name`,
   *          and optionally `hashedPassword` (if returned by the server for client-side storage).
   *          If an error occurs (network, HTTP, or API-specific), it returns an `IgUserRegistrationError`
   *          object with `error: true` and a descriptive message.
   */
  public async registerUser(params: Omit<IgUserRegistrationParams, 'networkuid'>): Promise<IgApiResponse> {
    // Prepare form data for the POST request.
    const bodyParams = new URLSearchParams();
    bodyParams.append('app_id', APP_ID);
    bodyParams.append('app_code', APP_CODE);
    // `networkuid` helps identify the device or client instance, generated if not already present.
    bodyParams.append('networkuid', getOrGenerateNetworkUid());

    // Append all provided registration parameters to the form data, excluding empty/null values.
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        const value = params[key as keyof typeof params];
        if (value !== undefined && value !== null && value !== '') {
          bodyParams.append(key, String(value));
        }
      }
    }

    let response: Response | undefined;
    let responseText = ''; // Store raw XML response for debugging.
    const requestUrl = `${API_BASE_URL}/api_user_add.php`;
    console.log(`[API Request] METHOD: POST, URL: ${requestUrl}, PARAMS: ${bodyParams.toString()}`);

    try {
      // Make the API call to the user registration endpoint.
      response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded', // Server expects form data.
        },
        body: bodyParams,
      });

      responseText = await response.text(); // Get the raw XML response body.
      console.log(`[API Response] URL: ${requestUrl}, STATUS: ${response.status}, BODY:\n${responseText}`);
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(responseText, "text/xml"); // Parse XML.

      // Handle HTTP errors (e.g., 4xx, 5xx).
      if (!response.ok) {
        let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
        const errorNode = xmlDoc.querySelector("errorMessage"); // Try to get a more specific error from XML.
        if (errorNode?.textContent) {
            errorMsg = errorNode.textContent;
        }
        return {
            error: true,
            message: errorMsg,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }

      // Check for API-specific errors within a 2xx HTTP response.
      const errorNode = xmlDoc.querySelector("errorMessage");
      if (errorNode?.textContent) {
        return {
            error: true,
            message: errorNode.textContent,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }

      // Parse successful registration data from XML.
      const uidNode = xmlDoc.querySelector("uid");
      const nameNode = xmlDoc.querySelector("name");
      const passwordNode = xmlDoc.querySelector("password"); // Server might return the hashed password.

      if (uidNode?.textContent && nameNode?.textContent) {
        const successResponse: IgUserRegistrationSuccessResponse = {
          uid: uidNode.textContent,
          name: nameNode.textContent,
          error: false,
        };
        if (passwordNode?.textContent) {
            // If server returns a password (expected to be hashed), include it.
            successResponse.hashedPassword = passwordNode.textContent;
        }
        return successResponse;
      } else {
        // Handle cases where the success response is missing expected XML tags.
        return {
            error: true,
            message: 'Malformed success response from server (registerUser). Expected <uid> and <name>.',
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }
    } catch (error) {
      // Handle network errors or other exceptions during the fetch operation.
      console.error('Network error during user registration:', error);
      let message = 'Network error. Please check your connection or try again later.';
      if (error instanceof Error) {
        if (error.message.toLowerCase().includes('failed to fetch')) {
            message = 'Failed to connect to the server. Please check your internet connection.';
        } else {
            message = error.message; // Use the specific error message.
        }
      }
      return {
          error: true,
          message,
          // No rawXmlResponse or HTTP status here as the request might not have completed.
        };
    }
  }

  /**
   * Logs in an existing user to the igGameCenter platform.
   *
   * This method sends the user's login (username) and an MD5 hashed version of their password.
   * The `md5: '1'` parameter indicates to the server that the provided password is already hashed.
   *
   * @param params - An object containing the user's `login` (username) and `password` (plaintext).
   *                 `networkuid` and `md5` flag are handled internally.
   * @returns A promise that resolves to an `IgApiResponse`.
   *          If successful, it's an `IgUserLoginSuccessResponse` containing `uid`, `name`, and `session_id`.
   *          The `session_id` is crucial for subsequent authenticated API calls.
   *          If an error occurs, it returns an `IgUserRegistrationError` object.
   */
  public async loginUser(params: Omit<IgUserLoginParams, 'networkuid' | 'md5'>): Promise<IgApiResponse> {
    const bodyParams = new URLSearchParams();
    bodyParams.append('app_id', APP_ID);
    bodyParams.append('app_code', APP_CODE);
    bodyParams.append('login', params.login);

    // Hash the password.
    bodyParams.append('password', md5(params.password));
    bodyParams.append('md5', '1');

    bodyParams.append('networkuid', getOrGenerateNetworkUid());

    let response: Response | undefined;
    let responseText = '';
    const requestUrl = `${API_BASE_URL}/api_login.php`;
    console.log(`[API Request] METHOD: POST, URL: ${requestUrl}, PARAMS: ${bodyParams.toString()}`);

    try {
      response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyParams,
      });

      responseText = await response.text();
      console.log(`[API Response] URL: ${requestUrl}, STATUS: ${response.status}, BODY:\n${responseText}`);
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(responseText, "text/xml");

      if (!response.ok) {
        let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
        const errorNode = xmlDoc.querySelector("errorMessage");
        if (errorNode?.textContent) {
            errorMsg = errorNode.textContent;
        }
        return {
            error: true,
            message: errorMsg,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }

      const errorNode = xmlDoc.querySelector("errorMessage");
      if (errorNode?.textContent) {
        return {
            error: true,
            message: errorNode.textContent,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }

      // Parse successful login data: user ID, name, and session ID.
      const uidNode = xmlDoc.querySelector("uid");
      const nameNode = xmlDoc.querySelector("name");
      const sessionIdNode = xmlDoc.querySelector("session_id");

      if (uidNode?.textContent && nameNode?.textContent && sessionIdNode?.textContent) {
        return { // Type assertion to IgUserLoginSuccessResponse
          uid: uidNode.textContent,
          name: nameNode.textContent,
          session_id: sessionIdNode.textContent,
          error: false,
        } as IgUserLoginSuccessResponse;
      } else {
        console.error("Malformed login response. Expected <uid>, <name>, and <session_id>.", responseText);
        return {
            error: true,
            message: 'Malformed success response from server (loginUser).',
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }
    } catch (error) {
      console.error('Network error during user login:', error);
      let message = 'Network error. Please check your connection or try again later.';
      if (error instanceof Error) {
         if (error.message.toLowerCase().includes('failed to fetch')) {
            message = 'Failed to connect to the server. Please check your internet connection.';
        } else {
            message = error.message;
        }
      }
      return {
          error: true,
          message
        };
    }
  }

  /**
   * Retrieves a user's profile information from igGameCenter.
   * This can include general profile data, game statistics (`stat`), and game logs (`log`).
   *
   * @param params - An object containing `uid` (user ID to fetch profile for).
   *                 Optionally, `session_id` can be provided for accessing private data
   *                 of the logged-in user. `stat: '1'` fetches game statistics,
   *                 and `log: '1'` fetches game history.
   * @returns A promise that resolves to either `IgUserProfileData` on success or
   *          `IgUserRegistrationError` on failure. The `IgUserProfileData` object
   *          contains a wealth of information parsed from the XML response.
   */
  public async getUserProfile(params: IgUserProfileParams): Promise<IgUserProfileData | IgUserRegistrationError> {
    const bodyParams = new URLSearchParams();
    bodyParams.append('app_id', APP_ID);
    bodyParams.append('app_code', APP_CODE);
    bodyParams.append('uid', params.uid);
    // Conditionally append optional parameters.
    if (params.session_id) bodyParams.append('session_id', params.session_id);
    if (params.stat) bodyParams.append('stat', params.stat); // '1' to request game statistics.
    if (params.log) bodyParams.append('log', params.log);   // '1' to request game log.

    let response: Response | undefined;
    let responseText = '';
    const requestUrl = `${API_BASE_URL}/api_profile.php`;
    console.log(`[API Request] METHOD: POST, URL: ${requestUrl}, PARAMS: ${bodyParams.toString()}`);

    try {
      response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams,
      });
      responseText = await response.text();
      console.log(`[API Response] URL: ${requestUrl}, STATUS: ${response.status}, BODY:\n${responseText}`);
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(responseText, "text/xml");

      if (!response.ok) {
        const errorNode = xmlDoc.querySelector("errorMessage");
        return {
            error: true,
            message: errorNode?.textContent || `HTTP Error ${response.status}: ${response.statusText}`,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }

      const errorNode = xmlDoc.querySelector("errorMessage");
      if (errorNode?.textContent) {
        return {
            error: true,
            message: errorNode.textContent,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }

      // Ensure the main <profile> tag exists.
      const profileNode = xmlDoc.querySelector("profile");
      if (!profileNode) {
        return { error: true, message: "Malformed profile response: <profile> tag missing.", rawXmlResponse: responseText, httpStatusCode: response.status, httpStatusText: response.statusText };
      }

      // Helper functions to safely extract text and number values from XML child nodes.
      const getText = (selector: string): string | undefined => profileNode.querySelector(selector)?.textContent || undefined;
      const getNumber = (selector: string): number | undefined => {
        const text = getText(selector);
        return text ? parseInt(text, 10) : undefined; // Convert valid text to number.
      };

      // Initialize the profile data object.
      const profileData: IgUserProfileData = { error: false };

      // Populate basic profile fields.
      profileData.curtime = getNumber("curtime"); // Server's current timestamp.
      profileData.isFastReg = getText("isFastReg") as '0' | '1' | undefined; // '1' if user was registered via a fast process.
      profileData.name = getText("name");
      profileData.realName = getText("realName");
      profileData.sex = getText("sex") as 'M' | 'F' | '-' | undefined;

      // Handle birth date, which might come in different formats.
      const birthDateFull = getText("birthDate"); // e.g., "DD-MM-YYYY"
      if (birthDateFull && birthDateFull.includes('-')) {
          profileData.birthDate = birthDateFull;
          const parts = birthDateFull.split('-');
          if (parts.length === 3) { // DD, MM, YYYY
            profileData.birthDay = parts[0];
            profileData.birthMonth = parts[1];
            profileData.birthYear = parts[2];
          }
      } else { // Fallback to individual day/month/year tags if full date not present.
          profileData.birthDay = getText("birthDay");
          profileData.birthMonth = getText("birthMonth");
          profileData.birthYear = getText("birthYear");
      }

      profileData.country = getText("country");
      profileData.location = getText("location");
      profileData.about = getText("about");
      profileData.registrationTime = getNumber("registrationTime"); // Timestamp of registration.
      profileData.lastAliveTime = getNumber("lastAliveTime"); // Timestamp of last activity.
      profileData.idleTimeSec = getNumber("idleTimeSec"); // Seconds since last activity.
      profileData.email = getText("email");
      profileData.subscribeNews = getText("subscribeNews") as '0' | '1' | undefined; // Newsletter subscription status.
      profileData.showEmail = getText("showEmail") as '0' | '1' | undefined; // Email visibility preference.
      profileData.showBirthday = getText("showBirthday") as '0' | '1' | undefined; // Birthday visibility.

      // Parse game statistics if present in the response (<gameStat> section).
      const gameStatNodes = profileNode.querySelectorAll("gameStat > game");
      if (gameStatNodes.length > 0) {
        profileData.gameStat = Array.from(gameStatNodes).map(node => ({
          gid: node.getAttribute("gid") || "", // Game ID.
          score: parseInt(node.getAttribute("score") || "0", 10),
          numGames: parseInt(node.getAttribute("numGames") || "0", 10),
          numWin: parseInt(node.getAttribute("numWin") || "0", 10),
          numLoss: parseInt(node.getAttribute("numLoss") || "0", 10),
          numDraw: parseInt(node.getAttribute("numDraw") || "0", 10),
          numQuit: parseInt(node.getAttribute("numQuit") || "0", 10), // Games quit/disconnected.
        } as IgGameStatEntry));
      }

      // Parse game log history if present (<gameLog> section).
      const gameLogNodes = profileNode.querySelectorAll("gameLog > game");
      if (gameLogNodes.length > 0) {
        profileData.gameLog = Array.from(gameLogNodes).map(node => ({
          gid: node.getAttribute("gid") || "",
          createTime: parseInt(node.getAttribute("createTime") || "0", 10), // Timestamp game was created.
          durationMin: parseInt(node.getAttribute("durationMin") || "0", 10), // Game duration.
          players: Array.from(node.querySelectorAll("players > player")).map(pNode => ({ // List of players in that game.
            uid: pNode.getAttribute("uid") || "",
            name: pNode.getAttribute("name") || "",
            stat: (pNode.getAttribute("stat") || 'DRAW') as 'WIN' | 'LOST' | 'DRAW' | 'QUIT', // Player's outcome.
            scoreOld: parseInt(pNode.getAttribute("scoreOld") || "0", 10), // Score before this game.
            scoreNew: parseInt(pNode.getAttribute("scoreNew") || "0", 10), // Score after this game.
          } as IgGameLogPlayer)),
        } as IgGameLogEntry));
      }
      return profileData;

    } catch (error) {
      console.error('Network error during get user profile:', error);
      let message = 'Network error. Please check your connection or try again later.';
      if (error instanceof Error) {
        message = error.message.toLowerCase().includes('failed to fetch')
          ? 'Failed to connect to the server. Please check your internet connection.'
          : error.message;
      }
      return {
          error: true,
          message,
          rawXmlResponse: responseText, // Include raw response if partially available.
          httpStatusCode: response?.status,
          httpStatusText: response?.statusText
      };
    }
  }

  /**
   * Updates a user's profile information on the igGameCenter platform.
   * Requires `uid` and a valid `session_id` for authentication.
   * Various profile fields can be updated, including password (which will be MD5 hashed).
   * Sending an empty string for fields like `realName`, `country`, etc., will clear them on the server.
   *
   * @param params - An object containing `uid`, `session_id`, and the profile fields to update.
   *                 Any fields not provided or `undefined` will not be sent for update,
   *                 except for password which is only sent if non-empty.
   * @returns A promise that resolves to `IgUserUpdateSuccessResponse` ({ success: true, error: false })
   *          on successful update, or `IgUserRegistrationError` on failure.
   */
  public async updateUserProfile(params: IgUserUpdateParams): Promise<IgUserUpdateSuccessResponse | IgUserRegistrationError> {
    const bodyParams = new URLSearchParams();
    bodyParams.append('app_id', APP_ID);
    bodyParams.append('app_code', APP_CODE);
    bodyParams.append('uid', params.uid);
    bodyParams.append('session_id', params.session_id);

    // Iterate over all keys in IgUserUpdateParams to build the request body.
    (Object.keys(params) as Array<keyof IgUserUpdateParams>).forEach(key => {
      // Exclude mandatory auth fields (uid, session_id) and undefined/null values.
      if (key !== 'uid' && key !== 'session_id' && params[key] !== undefined && params[key] !== null) {
        const value = params[key];

        if (key === 'password') {
          // Only send password if it's a non-empty string; hash it.
          if (typeof value === 'string' && value.trim() !== '') {
            const hashedPassword = md5(value.trim());
            bodyParams.append(key, hashedPassword);
          }
        } else if (typeof value === 'number' || // Numbers are sent as is.
                   (typeof value === 'string' && value.trim() !== '') || // Non-empty strings.
                   ['subscribeNews', 'showEmail', 'showBirthday'].includes(key) // Boolean-like flags (0 or 1 as string).
        ) {
           bodyParams.append(key, String(value));
        } else if (typeof value === 'string' && value.trim() === '' &&
                   // Explicitly allow sending empty strings for these fields to clear them.
                   (key === 'realName' || key === 'country' || key === 'location' || key === 'about' || key === 'email' || key === 'name')) {
            bodyParams.append(key, ''); // Send empty string to clear the field.
        }
      }
    });

    let response: Response | undefined;
    let responseText = '';
    const requestUrl = `${API_BASE_URL}/api_user_edit.php`;
    console.log(`[API Request] METHOD: POST, URL: ${requestUrl}, PARAMS: ${bodyParams.toString()}`);

    try {
      response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams,
      });
      responseText = await response.text();
      console.log(`[API Response] URL: ${requestUrl}, STATUS: ${response.status}, BODY:\n${responseText}`);
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(responseText, "text/xml");

      if (!response.ok) {
         const errorNode = xmlDoc.querySelector("errorMessage");
         return {
            error: true,
            message: errorNode?.textContent || `HTTP Error ${response.status}: ${response.statusText}`,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }

      const errorNode = xmlDoc.querySelector("errorMessage");
      if (errorNode?.textContent) {
        return {
            error: true,
            message: errorNode.textContent,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }

      // Successful update is indicated by the presence of a <userUpdateSuccess> tag.
      if (xmlDoc.querySelector("userUpdateSuccess")) {
        return { success: true, error: false };
      } else {
        // If no error and no success tag, the response is considered malformed.
        return { error: true, message: "Malformed success response from server (updateUserProfile). Expected <userUpdateSuccess> tag.", rawXmlResponse: responseText, httpStatusCode: response.status, httpStatusText: response.statusText };
      }

    } catch (error) {
      console.error('Network error during update user profile:', error);
      let message = 'Network error. Please check your connection or try again later.';
      if (error instanceof Error) {
         message = error.message.toLowerCase().includes('failed to fetch')
          ? 'Failed to connect to the server. Please check your internet connection.'
          : error.message;
      }
      return {
          error: true,
          message,
          rawXmlResponse: responseText,
          httpStatusCode: response?.status,
          httpStatusText: response?.statusText
      };
    }
  }

  /**
   * Requests to join a random game session for a specific game ID (`gid`).
   * This is typically used for matchmaking.
   *
   * @param params - An object containing `uid`, `session_id` (for authentication),
   *                 `gid` (the ID of the game to join), and optionally `place`
   *                 (desired place/seat in the game, if applicable).
   * @returns A promise that resolves to an `IgJoinRandomGameResponse`.
   *          On success, this contains `sid` (the game session ID for `api_handler.php` calls)
   *          and `server` (the URL of the specific game server instance).
   *          On failure, it includes `error: true` and a message.
   */
  public async joinRandomGame(params: IgJoinRandomGameParams): Promise<IgJoinRandomGameResponse> {
    const bodyParams = new URLSearchParams();
    bodyParams.append('app_id', APP_ID);
    bodyParams.append('app_code', APP_CODE);
    bodyParams.append('uid', params.uid);
    bodyParams.append('session_id', params.session_id);
    bodyParams.append('gid', params.gid); // Game ID.
    if (params.place) { // Optional desired place/slot.
      bodyParams.append('place', params.place);
    }

    let response: Response | undefined;
    let responseText = '';
    const requestUrl = `${API_BASE_URL}/api_board_random.php`;
    console.log(`[API Request] METHOD: POST, URL: ${requestUrl}, PARAMS: ${bodyParams.toString()}`);

    try {
      response = await fetch(requestUrl, { // Endpoint for random game joining.
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams,
      });
      responseText = await response.text();
      console.log(`[API Response] URL: ${requestUrl}, STATUS: ${response.status}, BODY:\n${responseText}`);
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(responseText, "text/xml");

      if (!response.ok) {
        const errorNode = xmlDoc.querySelector("errorMessage");
        return {
            error: true,
            message: errorNode?.textContent || `HTTP Error ${response.status}: ${response.statusText}`,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }

      const errorNode = xmlDoc.querySelector("errorMessage");
      if (errorNode?.textContent) {
        return {
            error: true,
            message: errorNode.textContent,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }

      // Successful response contains <sid> (game session ID) and <server> (game server URL).
      const sidNode = xmlDoc.querySelector("sid");
      const serverNode = xmlDoc.querySelector("server");

      if (sidNode?.textContent && serverNode?.textContent) {
        return { // Type assertion matches IgJoinRandomGameSuccessResponse part of the union
          sid: sidNode.textContent,
          server: serverNode.textContent,
          error: false,
        } as IgJoinRandomGameResponse; // Or more specifically as IgJoinRandomGameSuccessResponse
      } else {
        return {
            error: true,
            message: 'Malformed success response from server (joinRandomGame). Expected <sid> and <server>.',
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }
    } catch (error) {
      console.error('Network error during join random game:', error);
      let message = 'Network error. Please check your connection or try again later.';
      if (error instanceof Error) {
        message = error.message.toLowerCase().includes('failed to fetch')
          ? 'Failed to connect to the server. Please check your internet connection.'
          : error.message;
      }
      return {
          error: true,
          message,
          rawXmlResponse: responseText,
          httpStatusCode: response?.status,
          httpStatusText: response?.statusText
      };
    }
  }

  /**
   * Creates a new game board session for a specific game ID (`gid`).
   *
   * @param params - An object containing `uid`, `session_id` (for authentication),
   *                 `gid` (the ID of the game to create), and optionally `place`
   *                 (host's desired starting place) and `private` ('0' or '1').
   * @returns A promise that resolves to an `IgCreateBoardResponse`.
   *          On success, this contains `sid` and `server`.
   *          On failure, it includes `error: true` and a message.
   */
  public async createBoardSession(params: IgCreateBoardParams): Promise<IgCreateBoardResponse> {
    const bodyParams = new URLSearchParams();
    bodyParams.append('app_id', APP_ID);
    bodyParams.append('app_code', APP_CODE);
    bodyParams.append('uid', params.uid);
    bodyParams.append('session_id', params.session_id);
    bodyParams.append('gid', params.gid);
    if (params.place) {
      bodyParams.append('place', params.place);
    }
    if (params.private !== undefined) { // Check if private is explicitly provided
      bodyParams.append('private', params.private);
    }

    let response: Response | undefined;
    let responseText = '';
    const requestUrl = `${API_BASE_URL}/api_board_create.php`;
    console.log(`[API Request] METHOD: POST, URL: ${requestUrl}, PARAMS: ${bodyParams.toString()}`);

    try {
      response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams,
      });
      responseText = await response.text();
      console.log(`[API Response] URL: ${requestUrl}, STATUS: ${response.status}, BODY:\n${responseText}`);
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(responseText, "text/xml");

      if (!response.ok) {
        const errorNode = xmlDoc.querySelector("errorMessage");
        return {
            error: true,
            message: errorNode?.textContent || `HTTP Error ${response.status}: ${response.statusText}`,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }

      const errorNode = xmlDoc.querySelector("errorMessage");
      if (errorNode?.textContent) {
        return {
            error: true,
            message: errorNode.textContent,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }

      const sidNode = xmlDoc.querySelector("sid");
      const serverNode = xmlDoc.querySelector("server");

      if (sidNode?.textContent && serverNode?.textContent) {
        return {
          sid: sidNode.textContent,
          server: serverNode.textContent,
          error: false,
        } as IgCreateBoardSuccessResponse;
      } else {
        return {
            error: true,
            message: 'Malformed success response from server (createBoardSession). Expected <sid> and <server>.',
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }
    } catch (error) {
      console.error('Network error during create board session:', error);
      let message = 'Network error. Please check your connection or try again later.';
      if (error instanceof Error) {
        message = error.message.toLowerCase().includes('failed to fetch')
          ? 'Failed to connect to the server. Please check your internet connection.'
          : error.message;
      }
      return {
          error: true,
          message,
          rawXmlResponse: responseText,
          httpStatusCode: response?.status,
          httpStatusText: response?.statusText
      };
    }
  }

  /**
   * Fetches the list of open game sessions (lobby) from igGameCenter.
   * Aligned with Java implementation to use /api_board_list.php.
   * @param params Parameters including UID, session ID, and game ID (gid).
   * @returns A promise that resolves to IgLobbyResponse.
   */
  public async fetchLobby(params: IgLobbyApiParams): Promise<IgLobbyResponse> {
    const bodyParams = new URLSearchParams();
    bodyParams.append('app_id', APP_ID);
    bodyParams.append('app_code', APP_CODE);
    bodyParams.append('uid', params.uid);
    bodyParams.append('session_id', params.session_id);
    bodyParams.append('gid', params.gid);

    let response: Response | undefined;
    let responseText = '';
    const requestUrl = `${API_BASE_URL}/api_board_list.php`;
    console.log(`[API Request] METHOD: POST, URL: ${requestUrl}, PARAMS: ${bodyParams.toString()}`);

    try {
      response = await fetch(requestUrl, { // Changed from /api_lobby.php
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams,
      });
      responseText = await response.text();
      console.log(`[API Response] URL: ${requestUrl}, STATUS: ${response.status}, BODY:\n${responseText}`);
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(responseText, "text/xml");

      if (!response.ok) {
        const errorNode = xmlDoc.querySelector("errorMessage");
        return {
            error: true,
            message: errorNode?.textContent || `HTTP Error ${response.status}: ${response.statusText}`,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }

      const errorNode = xmlDoc.querySelector("errorMessage");
      if (errorNode?.textContent) {
        return {
            error: true,
            message: errorNode.textContent,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }
      
      const sessionNodes = xmlDoc.querySelectorAll("sessionList > session"); // Changed selector
      const lobbySessions: LobbyGameSession[] = [];

      sessionNodes.forEach(node => {
        const getAttr = (attrName: string) => node.getAttribute(attrName);
        
        const members: LobbyGameSessionMember[] = [];
        node.querySelectorAll("member").forEach(memberNode => {
            members.push({
                place: memberNode.getAttribute("plc") || "0",
                uid: memberNode.getAttribute("uid") || "",
                name: memberNode.getAttribute("nam") || "Unknown Player",
                stat: (memberNode.getAttribute("stat") || PlayerStat.NONE) as PlayerStat,
            });
        });

        lobbySessions.push({
          sid: getAttr("sid") || "",
          state: getAttr("stat") || "UNKNOWN", // 'stat' attribute on <session> for game state
          ownerUid: getAttr("uid") || "", // 'uid' attribute on <session> for owner
          server: getAttr("serv") || "",  // 'serv' attribute on <session> for server
          priv: getAttr("priv") as '0' | '1' | undefined, // 'priv' attribute for private status
          members: members,
          // Derived client-side if needed:
          gameName: "Hex", // Hardcoded for this app
          numPlayers: members.filter(m => m.place !== "0").length,
          maxPlayers: 2,
        });
      });
      
      return { sessions: lobbySessions, error: false } as IgLobbySuccessResponse;

    } catch (error) {
      console.error('Network error during fetch lobby:', error);
      let message = 'Network error. Please check your connection or try again later.';
      if (error instanceof Error) {
        message = error.message.toLowerCase().includes('failed to fetch')
          ? 'Failed to connect to the server. Please check your internet connection.'
          : error.message;
      }
      return {
          error: true,
          message,
          rawXmlResponse: responseText,
          httpStatusCode: response?.status,
          httpStatusText: response?.statusText
      };
    }
  }


  /**
   * Sends a command to a specific game server instance using `api_handler.php`.
   * This is the primary method for in-game actions, state synchronization, and receiving game events.
   * The structure of the request and response is highly dependent on the specific `cmd` (command) being sent.
   *
   * @param params - An object (`IgCommandHandlerFullParams`) containing all necessary parameters for the command.
   *                 This typically includes `app_id`, `app_code`, `uid`, `session_id` (user session),
   *                 `sid` (game session ID obtained from `joinRandomGame` or similar), `cmd` (the command name),
   *                 and potentially other command-specific data like `last_eid` (last event ID received).
   * @param serverName - The game server identifier (e.g., "gc1").
   *                    The full URL will be constructed using `API_SERVER_URL_TEMPLATE`.
   * @returns A promise resolving to `IgCommandHandlerResponse`.
   *          On success, this is an `IgCommandHandlerSuccessResponse` containing detailed game state
   *          information such as session info, player lists, guest lists, game events, game-specific data,
   *          and game options, all parsed from the XML.
   *          On failure, it returns an `IgUserRegistrationError` (reused error type).
   */
  public async handleGameCommand(params: IgCommandHandlerFullParams, serverName: string): Promise<IgCommandHandlerResponse> {
    const bodyParams = new URLSearchParams();
    // Append all provided parameters to the form data.
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key) && params[key as keyof IgCommandHandlerFullParams] !== undefined) {
        bodyParams.append(key, params[key as keyof IgCommandHandlerFullParams] as string);
      }
    }

    let response: Response | undefined;
    let responseText = '';
    const requestUrl = `${API_SERVER_URL_TEMPLATE.replace('{serverName}', serverName)}/api_handler.php`;
    console.log(`[API Request] METHOD: POST, URL: ${requestUrl}, PARAMS: ${bodyParams.toString()}`);

    try {
      // The endpoint is always api_handler.php on the specific game server.
      response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams,
      });
      responseText = await response.text();
      console.log(`[API Response] URL: ${requestUrl}, STATUS: ${response.status}, BODY:\n${responseText}`);
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(responseText, "text/xml");

      if (!response.ok) {
        const errorNode = xmlDoc.querySelector("errorMessage");
        return {
            error: true,
            message: errorNode?.textContent || `HTTP Error ${response.status}: ${response.statusText}`,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }

      const errorNode = xmlDoc.querySelector("errorMessage");
      if (errorNode?.textContent) {
        return {
            error: true,
            message: errorNode.textContent,
            rawXmlResponse: responseText,
            httpStatusCode: response.status,
            httpStatusText: response.statusText
        };
      }

      // The main container for game handler responses.
      const handlerDataNode = xmlDoc.querySelector("handlerData");
      if (!handlerDataNode) {
        return { error: true, message: "Malformed handler response: <handlerData> tag missing.", rawXmlResponse: responseText, httpStatusCode: response.status, httpStatusText: response.statusText };
      }

      // Essential info nodes.
      const sInfoNode = handlerDataNode.querySelector("sessionInfo"); // Overall game session status.
      const mInfoNode = handlerDataNode.querySelector("memberInfo");  // Status of the current user in this session.

      if (!sInfoNode || !mInfoNode) {
         return { error: true, message: "Malformed handler response: <sessionInfo> or <memberInfo> missing.", rawXmlResponse: responseText, httpStatusCode: response.status, httpStatusText: response.statusText };
      }

      // Initialize the success response object.
      const successResponse: IgCommandHandlerSuccessResponse = {
        sessionInfo: {
          cmd: sInfoNode.getAttribute("cmd") || "", // Command that this response is for.
          curtime: parseInt(sInfoNode.getAttribute("curtime") || "0", 10), // Server timestamp.
          status: (sInfoNode.getAttribute("status") || 'INIT') as 'INIT' | 'ACTIVE' | 'FINISHED', // Game status.
          owner: sInfoNode.getAttribute("owner") || "", // UID of the game owner/creator.
          activePlayer: sInfoNode.getAttribute("activePlayer") || undefined, // activePlayer attribute on sessionInfo
        },
        memberInfo: { // Info about the requesting user's status in the game.
          active: (mInfoNode.getAttribute("active") || '0') as '0' | '1', // Is it this user's turn?
          finished: (mInfoNode.getAttribute("finished") || '0') as '0' | '1', // Has this user finished the game?
          place: mInfoNode.getAttribute("place") || "0", // User's place/slot in the game.
        },
        error: false,
      };

      // Parse list of all players in the game session.
      const playerListNodes = handlerDataNode.querySelectorAll("playerList > player");
      if (playerListNodes.length > 0) {
        successResponse.playerList = Array.from(playerListNodes).map(pNode => ({
          uid: pNode.getAttribute("uid") || "",
          name: pNode.getAttribute("name") || "",
          sex: (pNode.getAttribute("sex") || '-') as 'M' | 'F' | '-',
          score: parseInt(pNode.getAttribute("score") || "0", 10), // Player's game score/rating.
          place: pNode.getAttribute("place") || "0", // Player's assigned place/slot.
          stat: (pNode.getAttribute("stat") || PlayerStat.NONE) as PlayerStat, // Game outcome for this player.
          lastRefresh: parseInt(pNode.getAttribute("lastRefresh") || "0", 10), // Timestamp of player's last refresh/action.
          timerLeft: pNode.hasAttribute("timerLeft") ? parseInt(pNode.getAttribute("timerLeft")!, 10) : undefined, // Remaining time for this player.
          online: (pNode.getAttribute("online") || '0') as '0' | '1', // Is player currently online?
          active: (pNode.getAttribute("active") || '0') as '0' | '1', // Is it this player's turn?
          finished: (pNode.getAttribute("finished") || '0') as '0' | '1', // Has this player finished?
        }));
      }

      // Parse list of guests/spectators in the game session.
      const guestListNodes = handlerDataNode.querySelectorAll("guestList > guest");
      if (guestListNodes.length > 0) {
        successResponse.guestList = Array.from(guestListNodes).map(gNode => ({
          uid: gNode.getAttribute("uid") || "",
          name: gNode.getAttribute("name") || "",
          score: parseInt(gNode.getAttribute("score") || "0", 10), // Guest's general score/rating.
        }));
      }

      // Parse list of game events that occurred since `last_eid`.
      const eventListNodes = handlerDataNode.querySelectorAll("eventList > event");
      if (eventListNodes.length > 0) {
        successResponse.eventList = Array.from(eventListNodes).map(eNode => ({
          eid: eNode.getAttribute("eid") || "", // Unique event ID.
          stamp: parseInt(eNode.getAttribute("stamp") || "0", 10), // Timestamp of the event.
          uid: eNode.getAttribute("uid") || "0", // UID of the user who triggered the event (or "0" for system/notice events).
          type: eNode.getAttribute("type") || "", // Type of event (e.g., "MOVE", "CHAT", "JOIN").
          data: eNode.getAttribute("data") || undefined, // Additional data associated with the event (often game-specific).
        } as IgGameEvent));
      }

      // Parse game-specific data (e.g., board state).
      const gameDataNode = handlerDataNode.querySelector("gameData");
      if (gameDataNode) {
        successResponse.gameData = {};
        const boardNode = gameDataNode.querySelector("board"); // Common game data field.
        if (boardNode) successResponse.gameData.board = boardNode.textContent || undefined;
        // Other game-specific data elements would be parsed here based on game requirements.
        // e.g., successResponse.gameData.currentPlayer = gameDataNode.querySelector("currentPlayer")?.textContent;
      }

      // Parse game options/settings.
      const gameOptionsNode = handlerDataNode.querySelector("gameOptions");
      if (gameOptionsNode) {
        successResponse.gameOptions = {};
        const privateNode = gameOptionsNode.querySelector("private"); // Is game private?
        if (privateNode) successResponse.gameOptions.private = privateNode.textContent as '0' | '1' | undefined;
        const scoredNode = gameOptionsNode.querySelector("scored"); // Is game ranked/scored?
        if (scoredNode) successResponse.gameOptions.scored = scoredNode.textContent as '0' | '1' | undefined;
        const timerTotalNode = gameOptionsNode.querySelector("timerTotal"); // Total time per player.
        if (timerTotalNode?.textContent) successResponse.gameOptions.timerTotal = parseInt(timerTotalNode.textContent, 10);
        const timerIncNode = gameOptionsNode.querySelector("timerInc"); // Time increment per move.
        if (timerIncNode?.textContent) successResponse.gameOptions.timerInc = parseInt(timerIncNode.textContent, 10);
        const boardSizeNode = gameOptionsNode.querySelector("boardSize"); // Board size
        if (boardSizeNode?.textContent) successResponse.gameOptions.boardSize = parseInt(boardSizeNode.textContent, 10);
      }

      // Parse elapsed time for the API request processing on the server.
      const elapsedNode = handlerDataNode.querySelector("elapsed");
      if (elapsedNode?.textContent) {
        successResponse.elapsed = parseFloat(elapsedNode.textContent);
      }

      return successResponse;

    } catch (error) {
      console.error('Network error during handleGameCommand:', error);
      let message = 'Network error. Please check your connection or try again later.';
      if (error instanceof Error) {
        message = error.message.toLowerCase().includes('failed to fetch')
          ? 'Failed to connect to the server. Please check your internet connection.'
          : error.message;
      }
      return {
          error: true,
          message,
          rawXmlResponse: responseText,
          httpStatusCode: response?.status,
          httpStatusText: response?.statusText
      };
    }
  }
}