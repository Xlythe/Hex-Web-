
import { Player, PlayerProfile } from './types';
import { DEFAULT_PLAYER_1_PROFILE_BASE, DEFAULT_PLAYER_2_PROFILE_BASE, COLOR_PALETTE, ColorPaletteType } from './Constants';

/**
 * @class GameParticipant
 * @description Represents a participant in the game, holding their profile (name and color)
 * and tracking the board side (Player.ONE or Player.TWO) they were *initially* assigned to control.
 * This initial assignment is important for correctly interpreting game state, especially when the swap rule is involved.
 * Profiles are validated upon creation and update to ensure names are trimmed and colors are valid.
 */
export class GameParticipant {
  /**
   * @constructor
   * @description Initializes a new GameParticipant.
   * @param {Player} initialBoardSide - The board side (Player.ONE or Player.TWO) this participant
   *                                    is initially set to control. This does not change even if roles are swapped later in the game.
   * @param {PlayerProfile} [profile] - The player's profile. Defaults to standard Player 1 or Player 2 profiles
   *                                    based on `initialBoardSide`. The profile is validated upon construction.
   */
  constructor(
    public readonly initialBoardSide: Player, // The board side this participant was *initially* assigned to control
    public profile: PlayerProfile = (initialBoardSide === Player.ONE ? { ...DEFAULT_PLAYER_1_PROFILE_BASE } : { ...DEFAULT_PLAYER_2_PROFILE_BASE })
  ) {
    this.validateProfile();
  }

  /**
   * @private
   * @method validateProfile
   * @description Validates the current profile of the participant.
   * Ensures the name is trimmed and not empty (falls back to a default name if it is).
   * Ensures the color is one of the `COLOR_PALETTE` (falls back to a default color if invalid).
   * This method is called during construction and can be used internally if profile integrity needs re-checking.
   */
  private validateProfile(): void {
    const defaultProfile = this.initialBoardSide === Player.ONE ? DEFAULT_PLAYER_1_PROFILE_BASE : DEFAULT_PLAYER_2_PROFILE_BASE;
    this.profile.name = this.profile.name?.trim() || defaultProfile.name;
    if (!COLOR_PALETTE.includes(this.profile.color as ColorPaletteType)) {
      this.profile.color = defaultProfile.color;
    }
  }

  /**
   * @method updateProfile
   * @description Updates the participant's profile with a new name and color.
   * The name is trimmed. The color is validated against `COLOR_PALETTE`; if invalid,
   * it falls back to the default color associated with the participant's `initialBoardSide`.
   * Note: This method allows the name to be an empty string after trimming.
   * Final validation for empty names (e.g., ensuring distinctness or enforcing non-empty)
   * is typically handled by `GameOptions` when settings are applied globally.
   * @param {string} name - The new name for the player.
   * @param {string} color - The new hex color string for the player.
   */
  public updateProfile(name: string, color: string): void {
    // When updating, we don't necessarily want to force default names if empty, let GameOptions handle that.
    this.profile = { name: name.trim(), color }; 
    // But we should validate the color.
    if (!COLOR_PALETTE.includes(this.profile.color as ColorPaletteType)) {
        const defaultProfile = this.initialBoardSide === Player.ONE ? DEFAULT_PLAYER_1_PROFILE_BASE : DEFAULT_PLAYER_2_PROFILE_BASE;
        this.profile.color = defaultProfile.color;
    }
  }
}