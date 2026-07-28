import React, { useState, useEffect, ChangeEvent, FormEvent, useCallback } from 'react';
import {
  LoggedInUser,
  IgUserProfileData,
  IgUserUpdateParams,
  IgUserRegistrationError,
  IgGameStatEntry,
  IgGameLogPlayer,
} from '../types';
import { useAuth } from '../hooks/useAuth'; // Import useAuth hook
import { formatTime } from '../utils';
import { CloseIcon } from '../icons/CloseIcon';
import { ChevronDownIcon } from '../icons/ChevronDownIcon';
import { HEX_GID } from '../Constants';
import { ResetIcon } from '../icons/ResetIcon'; // For refresh button

// Import new icons
import { GlobeIcon } from '../icons/GlobeIcon';
import { UserIcon } from '../icons/UserIcon';
import { UserCircleIcon } from '../icons/UserCircleIcon';
import { IdentificationIcon } from '../icons/IdentificationIcon';
import { CalendarDaysIcon } from '../icons/CalendarDaysIcon';
import { EnvelopeIcon } from '../icons/EnvelopeIcon';
import { CalendarIcon } from '../icons/CalendarIcon';
import { ClockIcon } from '../icons/ClockIcon';
import { HourglassIcon } from '../icons/HourglassIcon';
import { CheckBadgeIcon } from '../icons/CheckBadgeIcon';
import { XCircleIcon } from '../icons/XCircleIcon';
import { EyeIcon } from '../icons/EyeIcon';
import { EyeSlashIcon } from '../icons/EyeSlashIcon';
import { BoltIcon } from '../icons/BoltIcon';


interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  loggedInUser: LoggedInUser; 
  onProfileUpdated: (updatedName: string) => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, loggedInUser, onProfileUpdated }) => {
  const {
    cachedUserProfile, // Now directly use the cached profile from context
    fetchUserProfile,  // This function now handles cache logic
    isProfileLoading,  // Use loading state from context
    updateProfile: updateProfileFromAuth, 
  } = useAuth();

  const [viewMode, setViewMode] = useState<'view' | 'edit'>('view');
  // ProfileData state is now primarily for deriving editableData and reflecting the latest view
  const [profileDataForView, setProfileDataForView] = useState<IgUserProfileData | null>(null);
  const [editableData, setEditableData] = useState<Partial<Omit<IgUserUpdateParams, 'uid' | 'session_id'>>>({});
  const [error, setError] = useState<IgUserRegistrationError | string | null>(null);
  const [isErrorDetailsOpen, setIsErrorDetailsOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // isButtonTriggeredRefresh is used to show spinner on refresh button, context handles actual loading state.
  const [isButtonTriggeredRefreshLocal, setIsButtonTriggeredRefreshLocal] = useState(false);
  const [isMatchHistoryOpen, setIsMatchHistoryOpen] = useState<boolean>(false);

  // Consolidate loading state for UI disabling
  const isLoading = isProfileLoading || isButtonTriggeredRefreshLocal;

  const setEditableDataFromProfile = (profile: IgUserProfileData | null) => {
    if (profile) {
      const { name, realName, sex, email, birthDay, birthMonth, birthYear, country, location, about, subscribeNews, showEmail, showBirthday } = profile;
      setEditableData({
        name, realName, sex, email,
        birthDay: birthDay === '0' ? '' : birthDay || '',
        birthMonth: birthMonth === '0' ? '' : birthMonth || '',
        birthYear: birthYear === '0' ? '' : birthYear || '',
        country, location, about,
        subscribeNews, showEmail, showBirthday,
        password: '' // Always initialize password as empty for editing
      });
    } else {
      // Reset editable data if profile is null
      setEditableData({ password: '' });
    }
  };

  // Load profile data when modal opens or dependencies change
  useEffect(() => {
    if (isOpen && loggedInUser) {
      setError(null); // Clear previous errors
      setSuccessMessage(null);
      
      const loadData = async () => {
        // `fetchUserProfile` now handles cache logic.
        // No `forceRefresh` needed unless specifically triggered by refresh button.
        const result = await fetchUserProfile(); 
        if (result && !result.error) {
          setProfileDataForView(result as IgUserProfileData);
          setEditableDataFromProfile(result as IgUserProfileData);
        } else if (result && result.error) {
          setError(result as IgUserRegistrationError);
          setProfileDataForView(null);
        } else if (!result) { // Handle null case if fetchUserProfile returns null on error
          setError("Failed to fetch profile data or user not logged in.");
          setProfileDataForView(null);
        }
      };
      
      loadData();
      setViewMode('view'); 
      setIsMatchHistoryOpen(false);
    }
  }, [isOpen, loggedInUser, fetchUserProfile]); // `cachedUserProfile` removed, `fetchUserProfile` is stable

  // Update local view if cachedUserProfile from context changes (e.g., due to background update)
  useEffect(() => {
    if (isOpen && cachedUserProfile) {
      setProfileDataForView(cachedUserProfile);
      if (viewMode === 'view') { // Only update editable form if in view mode to avoid overwriting user edits
          setEditableDataFromProfile(cachedUserProfile);
      }
    }
  }, [isOpen, cachedUserProfile, viewMode]);


  const handleRefreshProfile = useCallback(async () => {
    setIsButtonTriggeredRefreshLocal(true);
    setError(null);
    setSuccessMessage(null);
    const minSpinDuration = 500; 
    const loadPromise = fetchUserProfile(true); // forceRefresh = true
    const timerPromise = new Promise(resolve => setTimeout(resolve, minSpinDuration));
    
    try {
      const result = await Promise.all([loadPromise, timerPromise]).then(values => values[0]);
      if (result && !result.error) {
        setProfileDataForView(result as IgUserProfileData);
        setEditableDataFromProfile(result as IgUserProfileData);
      } else if (result && result.error) {
        setError(result as IgUserRegistrationError);
      } else {
        setError("Failed to refresh profile data.");
      }
    } catch(e) {
        setError("An unexpected error occurred during refresh.");
        console.error("Profile refresh exception:", e);
    }
    finally {
      setIsButtonTriggeredRefreshLocal(false);
    }
  }, [fetchUserProfile]);

  if (!isOpen || !loggedInUser) return null;

  const handleEditChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setEditableData(prev => ({ ...prev, [name]: checked ? '1' : '0' }));
    } else {
      setEditableData(prev => ({ ...prev, [name]: value }));
    }
    setError(null);
    setIsErrorDetailsOpen(false);
    setSuccessMessage(null);
  };

  const handleEditSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsErrorDetailsOpen(false);
    setSuccessMessage(null);

    if (editableData.email && !/\S+@\S+\.\S+/.test(editableData.email)) {
      setError("Invalid email format."); return;
    }
    const { birthDay, birthMonth, birthYear } = editableData;
    if (birthDay || birthMonth || birthYear) {
        const day = parseInt(birthDay || '0', 10);
        const month = parseInt(birthMonth || '0', 10);
        const year = parseInt(birthYear || '0', 10);
        if (birthDay && (isNaN(day) || day < 1 || day > 31)) { setError("Invalid birth day."); return; }
        if (birthMonth && (isNaN(month) || month < 1 || month > 12)) { setError("Invalid birth month."); return; }
        if (birthYear && (isNaN(year) || year < 1900 || year > new Date().getFullYear())) { setError("Invalid birth year."); return; }
    }
    if (editableData.name !== undefined && editableData.name.trim() === '') {
        setError("Nickname cannot be empty."); return;
    }

    const updatePayload: IgUserUpdateParams = {
        uid: loggedInUser.uid,
        session_id: loggedInUser.session_id,
    };
    (Object.keys(editableData) as Array<keyof typeof editableData>).forEach(key => {
        const typedKey = key as keyof typeof editableData;
        if (editableData[typedKey] !== undefined && editableData[typedKey] !== null) {
             if (typedKey === 'password' && (editableData[typedKey] as string).trim() === '') {
                // Skip empty password
             } else {
                (updatePayload as any)[typedKey] = editableData[typedKey];
             }
        }
    });

    // Use updateProfileFromAuth which now handles its own loading state (isAuthLoading)
    const result = await updateProfileFromAuth(updatePayload);

    if (result.error) {
      setError(result.error as IgUserRegistrationError);
    } else {
      setSuccessMessage("Profile updated successfully!");
      if (editableData.name && editableData.name !== profileDataForView?.name) {
        onProfileUpdated(editableData.name); // Call prop for App.tsx to know name changed
      }
      // `updateProfileFromAuth` already triggers a profile refresh in AuthManager.
      // The `useEffect` watching `cachedUserProfile` will update `profileDataForView`.
      setViewMode('view');
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  const renderValue = (value: string | number | undefined, defaultValue: string = "N/A") =>
    value !== undefined && value !== null && String(value).trim() !== "" && String(value) !== "0" ? String(value) : defaultValue;

  const renderTimestamp = (ts?: number, type: 'dateOnly' | 'full' = 'full') => {
    if (!ts) return "N/A";
    const date = new Date(ts * 1000);
    if (type === 'dateOnly') {
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    }
    return date.toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const renderBooleanLikeWithIcon = (value?: '0' | '1', IconTrue: React.FC<any> = CheckBadgeIcon, IconFalse: React.FC<any> = XCircleIcon, trueText = "Yes", falseText = "No") => {
    const iconClass = "w-4 h-4 mr-1.5 flex-shrink-0";
    const textSpanClass = "text-sm text-theme-text-subtle"; 

    if (value === '1') {
      return (
        <span className="flex items-center">
          <IconTrue className={`${iconClass} text-green-500 dark:text-green-400`} />
          <span className={textSpanClass}>{trueText}</span>
        </span>
      );
    }
    if (value === '0') {
      return (
        <span className="flex items-center">
          <IconFalse className={`${iconClass} text-red-500 dark:text-red-400`} />
          <span className={textSpanClass}>{falseText}</span>
        </span>
      );
    }
    return <span className={`${textSpanClass} ml-[22px]`}>N/A</span>;
  };
  
  const renderPlayerStatusBadge = (status: IgGameLogPlayer['stat']) => {
    let bgColor = 'bg-gray-100 dark:bg-gray-600';
    let textColor = 'text-gray-700 dark:text-gray-200';
    switch (status) {
      case 'WIN':
        bgColor = 'bg-green-100 dark:bg-green-700';
        textColor = 'text-green-700 dark:text-green-100';
        break;
      case 'LOST':
        bgColor = 'bg-red-100 dark:bg-red-700';
        textColor = 'text-red-700 dark:text-red-100';
        break;
      case 'QUIT':
        bgColor = 'bg-yellow-100 dark:bg-yellow-600';
        textColor = 'text-yellow-700 dark:text-yellow-100';
        break;
    }
    return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${bgColor} ${textColor}`}>{status}</span>;
  };

  const canShowErrorDetails = typeof error === 'object' && error !== null && ((error as IgUserRegistrationError).rawXmlResponse || (error as IgUserRegistrationError).httpStatusCode);
  const filteredGameStats = profileDataForView?.gameStat?.filter(stat => stat.gid === HEX_GID) || [];
  const filteredGameLogs = profileDataForView?.gameLog?.filter(log => log.gid === HEX_GID) || [];

  const textInputBaseClasses = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50";
  const labelBaseClasses = "block text-sm font-medium text-theme-text-primary dark:text-theme-icon-dark";
  const sectionTitleClasses = "text-lg font-semibold text-theme-text-primary dark:text-theme-icon-dark"; 
  const collapsibleButtonClasses = "w-full flex justify-between items-center text-left py-2 focus:outline-none";
  const fieldGroupClasses = "grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3";
  const fieldItemClasses = "text-sm text-theme-text-subtle"; 
  const fieldItemWithIconClasses = `${fieldItemClasses} flex items-start`;
  const iconClasses = "w-4 h-4 mr-2 mt-0.5 text-theme-text-subtle flex-shrink-0";


  const showInitialLoadingMessage = isProfileLoading && !profileDataForView && !isButtonTriggeredRefreshLocal;

  const Section: React.FC<{ title: string; children: React.ReactNode; className?: string}> = ({ title, children, className }) => (
    <section className={`pt-3 ${className || ''}`}>
      <h3 className={`${sectionTitleClasses} border-b border-theme-divider-light dark:border-theme-divider-dark pb-1 mb-3`}>{title}</h3>
      {children}
    </section>
  );

  return (
    <div
      className="fixed inset-0 bg-black/70 dark:bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-labelledby="profile-modal-title" onClick={onClose}
    >
      <div
        className="bg-theme-card-bg-light dark:bg-theme-card-bg-dark p-6 rounded-lg shadow-xl max-w-2xl w-full text-theme-text-primary dark:text-theme-icon-dark overflow-y-auto max-h-[90vh] scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 id="profile-modal-title" className="text-2xl font-bold">
            {viewMode === 'view' ? 'Your Profile' : 'Edit Profile'}
          </h2>
          <div className="flex items-center space-x-2">
            {viewMode === 'view' && (
              <button
                onClick={handleRefreshProfile}
                aria-label="Refresh profile data"
                disabled={isLoading} 
                className="p-1 text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover rounded-full hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark transition-colors focus:outline-none focus:ring-0 disabled:opacity-50"
              >
                <ResetIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              onClick={onClose} aria-label="Close profile"
              className="p-1 text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover rounded-full hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark transition-colors focus:outline-none focus:ring-0"
            >
              <CloseIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {showInitialLoadingMessage && (
            <p className="text-center py-8 text-theme-text-subtle">Loading profile...</p>
        )}
        
        {!isProfileLoading && error && typeof error === 'object' && ( 
            <div className="my-2 p-3 bg-red-100 dark:bg-red-800 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-100 rounded-md text-sm" role="alert">
            <div
                className={`flex justify-between items-center ${canShowErrorDetails ? 'cursor-pointer' : ''}`}
                onClick={() => canShowErrorDetails && setIsErrorDetailsOpen(!isErrorDetailsOpen)}
                onKeyDown={(e) => { if (canShowErrorDetails && (e.key === 'Enter' || e.key === ' ')) setIsErrorDetailsOpen(!isErrorDetailsOpen);}}
                tabIndex={canShowErrorDetails ? 0 : -1}
                aria-expanded={isErrorDetailsOpen}
                aria-controls="error-details-profile"
            >
                <span>{(error as IgUserRegistrationError).message}</span>
                {canShowErrorDetails && (<ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${isErrorDetailsOpen ? 'transform rotate-180' : ''}`} />)}
            </div>
            {canShowErrorDetails && isErrorDetailsOpen && (
                <div id="error-details-profile" className="mt-2 pt-2 border-t border-red-300 dark:border-red-700">
                {(error as IgUserRegistrationError).httpStatusCode && (<p><strong>HTTP Status:</strong> {(error as IgUserRegistrationError).httpStatusCode} {(error as IgUserRegistrationError).httpStatusText || ''}</p>)}
                {(error as IgUserRegistrationError).rawXmlResponse && (<><p className="mt-1"><strong>Raw Server Response:</strong></p><pre className="mt-1 p-2 bg-red-50 dark:bg-red-900/50 text-xs rounded max-h-32 overflow-auto whitespace-pre-wrap break-all">{(error as IgUserRegistrationError).rawXmlResponse}</pre></>)}
                </div>
            )}
            </div>
        )}
        {!isProfileLoading && error && typeof error === 'string' && (  
            <div className="my-2 p-3 bg-red-100 dark:bg-red-800 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-100 rounded-md text-sm" role="alert">
                {error}
            </div>
        )}
        {successMessage && <div className="my-2 p-3 bg-green-100 dark:bg-green-800 border border-green-400 dark:border-green-600 text-green-700 dark:text-green-100 rounded-md text-sm" role="status">{successMessage}</div>}

        {!showInitialLoadingMessage && !profileDataForView && !error && viewMode === 'view' && (
            <p className="text-center py-8 text-theme-text-subtle">No profile data available. Try refreshing.</p>
        )}

        {profileDataForView && viewMode === 'view' && !showInitialLoadingMessage && (
          <div className="space-y-1">
            <Section title="Personal Details">
              <div className={fieldGroupClasses}>
                  <div className={fieldItemWithIconClasses}><UserIcon className={iconClasses} /><div><strong className={labelBaseClasses}>Nickname:</strong> {renderValue(profileDataForView.name)}</div></div>
                  <div className={fieldItemWithIconClasses}><UserCircleIcon className={iconClasses} /><div><strong className={labelBaseClasses}>Real Name:</strong> {renderValue(profileDataForView.realName)}</div></div>
                  <div className={fieldItemWithIconClasses}><IdentificationIcon className={iconClasses} /><div><strong className={labelBaseClasses}>Sex:</strong> {renderValue(profileDataForView.sex)}</div></div>
                  <div className={fieldItemWithIconClasses}><CalendarDaysIcon className={iconClasses} />
                    <div><strong className={labelBaseClasses}>Birthdate:</strong> 
                      {profileDataForView.showBirthday === '1' ? (profileDataForView.birthDate ? renderValue(profileDataForView.birthDate) : `${renderValue(profileDataForView.birthDay, '??')}-${renderValue(profileDataForView.birthMonth, '??')}-${renderValue(profileDataForView.birthYear, '????')}`) : "Private"}
                    </div>
                  </div>
                  <div className={fieldItemWithIconClasses}><GlobeIcon className={iconClasses} /><div><strong className={labelBaseClasses}>Country:</strong> {renderValue(profileDataForView.country)}</div></div>
                  <div className={fieldItemWithIconClasses}><GlobeIcon className={iconClasses} /><div><strong className={labelBaseClasses}>Location:</strong> {renderValue(profileDataForView.location)}</div></div>
              </div>
               <div className={`${fieldItemClasses} mt-3`}><strong className={labelBaseClasses}>About:</strong> {profileDataForView.about ? <pre className="whitespace-pre-wrap font-sans text-sm text-theme-text-subtle">{profileDataForView.about.replace(/\\n/g, '\n')}</pre> : <span className="ml-2">N/A</span>}</div>
            </Section>

            <Section title="Account Activity">
                 <div className={fieldGroupClasses}>
                    <div className={fieldItemWithIconClasses}><EnvelopeIcon className={iconClasses} /><div><strong className={labelBaseClasses}>Email:</strong> {profileDataForView.showEmail === '1' ? renderValue(profileDataForView.email) : "Private"}</div></div>
                    <div className={fieldItemWithIconClasses}><CalendarIcon className={iconClasses} /><div><strong className={labelBaseClasses}>Registered:</strong> {renderTimestamp(profileDataForView.registrationTime, 'dateOnly')}</div></div>
                    <div className={fieldItemWithIconClasses}><ClockIcon className={iconClasses} /><div><strong className={labelBaseClasses}>Last Seen:</strong> {renderTimestamp(profileDataForView.lastAliveTime, 'full')}</div></div>
                    <div className={fieldItemWithIconClasses}><HourglassIcon className={iconClasses} /><div><strong className={labelBaseClasses}>Idle Time:</strong> {profileDataForView.idleTimeSec !== undefined ? `${formatTime(profileDataForView.idleTimeSec)}` : "N/A"}</div></div>
                </div>
            </Section>

            <Section title="Preferences">
                <div className="space-y-2">
                    <div className={`${fieldItemClasses} flex items-center`}><strong className={`${labelBaseClasses} mr-2`}>Subscribed to News:</strong>{renderBooleanLikeWithIcon(profileDataForView.subscribeNews)}</div>
                    <div className={`${fieldItemClasses} flex items-center`}><strong className={`${labelBaseClasses} mr-2`}>Email Visibility:</strong>{renderBooleanLikeWithIcon(profileDataForView.showEmail, EyeIcon, EyeSlashIcon, "Public", "Private")}</div>
                    <div className={`${fieldItemClasses} flex items-center`}><strong className={`${labelBaseClasses} mr-2`}>Birthday Visibility:</strong>{renderBooleanLikeWithIcon(profileDataForView.showBirthday, EyeIcon, EyeSlashIcon, "Public", "Private")}</div>
                    <div className={`${fieldItemClasses} flex items-center`}><strong className={`${labelBaseClasses} mr-2`}>Fast Registration:</strong>{renderBooleanLikeWithIcon(profileDataForView.isFastReg, BoltIcon, XCircleIcon, "Yes", "No")}</div>
                </div>
            </Section>

            {/* Match History Section - Collapsible */}
            <div className="pt-3">
                <button 
                    type="button" 
                    onClick={() => setIsMatchHistoryOpen(!isMatchHistoryOpen)} 
                    className={`${collapsibleButtonClasses} border-b border-theme-divider-light dark:border-theme-divider-dark pb-1 mb-2`}
                    aria-expanded={isMatchHistoryOpen} 
                    aria-controls="match-history-content"
                >
                    <h3 className={`${sectionTitleClasses} mb-0 pb-0`}>Match History</h3> {/* Removed bottom margin/padding from h3 */}
                    <ChevronDownIcon className={`w-5 h-5 transform transition-transform duration-200 ${isMatchHistoryOpen ? 'rotate-180' : 'rotate-0'} text-theme-icon-light dark:text-theme-icon-dark`} />
                </button>
                {isMatchHistoryOpen && (
                    <div id="match-history-content" className="mt-2 space-y-3 pl-2 pr-1">
                        {filteredGameStats.length > 0 && (
                        <details className="group" open> {/* Keep stats open by default if section is expanded */}
                            <summary className="font-semibold cursor-pointer hover:underline list-none flex justify-between items-center py-1">
                            <span>Hex Game Statistics</span>
                            <ChevronDownIcon className="w-4 h-4 text-gray-500 group-open:rotate-180 transition-transform"/>
                            </summary>
                            <div className="mt-2 space-y-3 text-sm pl-2 pr-1 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                            {filteredGameStats.map((stat: IgGameStatEntry) => (
                                <div key={stat.gid} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md shadow">
                                <h4 className="font-medium text-theme-text-primary dark:text-theme-icon-dark mb-1">Hex</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-xs">
                                    <div><strong>Rating:</strong> {stat.score}</div>
                                    <div><strong>Played:</strong> {stat.numGames}</div>
                                    <div><strong>Wins:</strong> {stat.numWin}</div>
                                    <div><strong>Losses:</strong> {stat.numLoss}</div>
                                    <div><strong>Draws:</strong> {stat.numDraw}</div>
                                    <div><strong>Quits:</strong> {stat.numQuit}</div>
                                </div>
                                </div>
                            ))}
                            </div>
                        </details>
                        )}

                        {filteredGameLogs.length > 0 && (
                        <details className="group" open> {/* Keep logs open by default if section is expanded */}
                            <summary className="font-semibold cursor-pointer hover:underline list-none flex justify-between items-center py-1">
                            <span>Recent Hex Games</span>
                            <ChevronDownIcon className="w-4 h-4 text-gray-500 group-open:rotate-180 transition-transform"/>
                            </summary>
                            <div className="mt-2 space-y-3 text-sm pl-2 pr-1 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                            {filteredGameLogs.map((log, index) => (
                                <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md shadow space-y-1.5">
                                <div className="flex justify-between items-center text-xs text-theme-text-subtle border-b border-gray-200 dark:border-gray-600 pb-1 mb-1.5">
                                    <span>Hex</span>
                                    <span>{renderTimestamp(log.createTime, 'dateOnly')}</span>
                                    <span>Duration: {log.durationMin} min</span>
                                </div>
                                <ul className="space-y-1">
                                    {log.players.map(p => {
                                    const scoreDiff = p.scoreNew - p.scoreOld;
                                    const scoreDiffStr = scoreDiff > 0 ? `+${scoreDiff}` : String(scoreDiff);
                                    const scoreDiffColor = scoreDiff > 0 ? 'text-green-600 dark:text-green-400' : scoreDiff < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400';
                                    return (
                                        <li key={p.uid} className="flex justify-between items-center text-xs">
                                        <span className="font-medium">{p.name} <span className="text-gray-400 dark:text-gray-500">(UID:{p.uid})</span></span>
                                        <div className="flex items-center space-x-2">
                                            {renderPlayerStatusBadge(p.stat)}
                                            <span className="text-gray-500 dark:text-gray-400">{p.scoreOld} → {p.scoreNew}</span>
                                            <span className={`font-semibold ${scoreDiffColor}`}>({scoreDiffStr})</span>
                                        </div>
                                        </li>
                                    );
                                    })}
                                </ul>
                                </div>
                            ))}
                            </div>
                        </details>
                        )}
                        {filteredGameStats.length === 0 && filteredGameLogs.length === 0 && (
                            <p className="text-sm text-theme-text-subtle py-2">No match history available for Hex.</p>
                        )}
                    </div>
                )}
            </div>


             <div className="mt-6 flex justify-end">
                <button
                    onClick={() => {
                        setViewMode('edit');
                        // Ensure editableData is set from the most recent profileDataForView
                        setEditableDataFromProfile(profileDataForView); 
                        setEditableData(prev => ({...prev, password: ''})); // Clear password for edit form
                    }}
                    className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-theme-button-primary-text-light dark:text-theme-button-primary-text-dark bg-theme-button-primary-bg-light hover:bg-theme-button-primary-bg-light-hover dark:bg-theme-button-primary-bg-dark dark:hover:bg-theme-button-primary-bg-dark-hover transition-colors"
                    disabled={isLoading}
                >
                    Edit Profile
                </button>
            </div>
          </div>
        )}

        {viewMode === 'edit' && (
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className={fieldGroupClasses}>
                <div><label htmlFor="edit-name" className={labelBaseClasses}>Nickname</label><input type="text" name="name" id="edit-name" value={editableData.name || ''} onChange={handleEditChange} className={textInputBaseClasses} maxLength={15} disabled={isLoading} /></div>
                <div><label htmlFor="edit-realName" className={labelBaseClasses}>Real Name</label><input type="text" name="realName" id="edit-realName" value={editableData.realName || ''} onChange={handleEditChange} className={textInputBaseClasses} disabled={isLoading} /></div>
                <div><label htmlFor="edit-email" className={labelBaseClasses}>Email</label><input type="email" name="email" id="edit-email" value={editableData.email || ''} onChange={handleEditChange} className={textInputBaseClasses} disabled={isLoading} /></div>
                <div><label htmlFor="edit-password" className={labelBaseClasses}>New Password (Optional)</label><input type="password" name="password" id="edit-password" value={editableData.password || ''} onChange={handleEditChange} className={textInputBaseClasses} placeholder="Leave blank to keep current" disabled={isLoading} /></div>
            </div>
             <div className={fieldGroupClasses}>
                <div>
                    <label htmlFor="edit-sex" className={labelBaseClasses}>Sex</label>
                    <select name="sex" id="edit-sex" value={editableData.sex || '-'} onChange={handleEditChange} className={textInputBaseClasses} disabled={isLoading}>
                        <option value="-">-</option><option value="M">Male</option><option value="F">Female</option>
                    </select>
                </div>
                 <fieldset className="sm:col-span-2 border border-gray-300 dark:border-gray-700 rounded-md p-3">
                    <legend className={`${labelBaseClasses} text-xs px-1`}>Birthday</legend>
                    <div className="grid grid-cols-3 gap-2">
                        <div><label htmlFor="edit-birthDay" className={`${labelBaseClasses} text-xs`}>Day</label><input type="number" name="birthDay" id="edit-birthDay" value={editableData.birthDay || ''} onChange={handleEditChange} className={textInputBaseClasses} min="1" max="31" placeholder="DD" disabled={isLoading}/></div>
                        <div><label htmlFor="edit-birthMonth" className={`${labelBaseClasses} text-xs`}>Month</label><input type="number" name="birthMonth" id="edit-birthMonth" value={editableData.birthMonth || ''} onChange={handleEditChange} className={textInputBaseClasses} min="1" max="12" placeholder="MM" disabled={isLoading}/></div>
                        <div><label htmlFor="edit-birthYear" className={`${labelBaseClasses} text-xs`}>Year</label><input type="number" name="birthYear" id="edit-birthYear" value={editableData.birthYear || ''} onChange={handleEditChange} className={textInputBaseClasses} min="1900" max={new Date().getFullYear()} placeholder="YYYY" disabled={isLoading}/></div>
                    </div>
                </fieldset>
            </div>
            <div className={fieldGroupClasses}>
                <div><label htmlFor="edit-country" className={labelBaseClasses}>Country Code (2 letters)</label><input type="text" name="country" id="edit-country" value={editableData.country || ''} onChange={handleEditChange} className={textInputBaseClasses} maxLength={2} disabled={isLoading} /></div>
                <div><label htmlFor="edit-location" className={labelBaseClasses}>Location</label><input type="text" name="location" id="edit-location" value={editableData.location || ''} onChange={handleEditChange} className={textInputBaseClasses} disabled={isLoading} /></div>
                <div className="sm:col-span-2"><label htmlFor="edit-about" className={labelBaseClasses}>About Me</label><textarea name="about" id="edit-about" value={editableData.about || ''} onChange={handleEditChange} className={textInputBaseClasses} rows={2} disabled={isLoading}></textarea></div>
            </div>
            <div className="space-y-2 pt-2">
                <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" name="subscribeNews" checked={editableData.subscribeNews === '1'} onChange={handleEditChange} className="form-checkbox h-4 w-4 text-indigo-600 dark:text-yellow-500 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500 dark:focus:ring-yellow-600 bg-theme-card-bg-light dark:bg-theme-card-bg-dark" disabled={isLoading}/><span>Subscribe to newsletter</span></label>
                <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" name="showEmail" checked={editableData.showEmail === '1'} onChange={handleEditChange} className="form-checkbox h-4 w-4 text-indigo-600 dark:text-yellow-500 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500 dark:focus:ring-yellow-600 bg-theme-card-bg-light dark:bg-theme-card-bg-dark" disabled={isLoading}/><span>Show email on public profile</span></label>
                <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" name="showBirthday" checked={editableData.showBirthday === '1'} onChange={handleEditChange} className="form-checkbox h-4 w-4 text-indigo-600 dark:text-yellow-500 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500 dark:focus:ring-yellow-600 bg-theme-card-bg-light dark:bg-theme-card-bg-dark" disabled={isLoading}/><span>Show birthday on public profile</span></label>
            </div>

            <div className="mt-6 pt-4 border-t border-theme-divider-light dark:border-theme-divider-dark flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setViewMode('view');
                  setError(null);
                  setIsErrorDetailsOpen(false);
                  setEditableDataFromProfile(profileDataForView); // Revert editable data to last viewed profile
                  setEditableData(prev => ({...prev, password: ''})); 
                }}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-theme-text-primary dark:text-theme-icon-dark transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-theme-button-primary-text-light dark:text-theme-button-primary-text-dark bg-theme-button-primary-bg-light hover:bg-theme-button-primary-bg-light-hover dark:bg-theme-button-primary-bg-dark dark:hover:bg-theme-button-primary-bg-dark-hover transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ProfileModal;