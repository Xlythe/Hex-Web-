import { DEBUG } from './Constants';
import { IgGameCenterApi as RealApi } from './IgGameCenterApi';
import { MockIgGameCenterApi } from './mock/MockIgGameCenterApi';
import { 
  IgUserRegistrationParams, IgUserLoginParams, 
  IgUserRegistrationSuccessResponse, IgUserLoginSuccessResponse, IgUserRegistrationError, 
  IgApiResponse,
  IgUserProfileParams, IgUserProfileData,
  IgUserUpdateParams, IgUserUpdateSuccessResponse,
  IgJoinRandomGameParams, IgJoinRandomGameResponse,
  IgCommandHandlerFullParams, IgCommandHandlerResponse, // Added IgCommandHandler types
  IgLobbyApiParams, IgLobbyResponse, // Added Lobby types
  IgCreateBoardParams, IgCreateBoardResponse // Added Create Board types
} from './types';

// Define a common interface that both RealApi and MockIgGameCenterApi implement
export interface IGameCenterApi {
  registerUser(params: Omit<IgUserRegistrationParams, 'networkuid'>): Promise<IgApiResponse>;
  loginUser(params: Omit<IgUserLoginParams, 'networkuid'>): Promise<IgApiResponse>;
  getUserProfile(params: IgUserProfileParams): Promise<IgUserProfileData | IgUserRegistrationError>;
  updateUserProfile(params: IgUserUpdateParams): Promise<IgUserUpdateSuccessResponse | IgUserRegistrationError>;
  joinRandomGame(params: IgJoinRandomGameParams): Promise<IgJoinRandomGameResponse>;
  createBoardSession(params: IgCreateBoardParams): Promise<IgCreateBoardResponse>; // Added createBoardSession
  handleGameCommand(params: IgCommandHandlerFullParams, serverUrl: string): Promise<IgCommandHandlerResponse>; 
  fetchLobby(params: IgLobbyApiParams): Promise<IgLobbyResponse>; 
}

export const api: IGameCenterApi = DEBUG ? new MockIgGameCenterApi() : new RealApi();