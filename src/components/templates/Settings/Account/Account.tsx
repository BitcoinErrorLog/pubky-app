'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole, LogOut, Pencil, Trash2, UserRound } from 'lucide-react';
import { SETTINGS_ROUTES } from '@/app/routes';
import { useIsGrantSession } from '@/hooks/useIsGrantSession/useIsGrantSession';
import { useSignOut } from '@/hooks/useSignOut/useSignOut';
import { SettingsDivider } from '@/molecules/Settings/SettingsDivider/SettingsDivider';
import { SettingsSection } from '@/molecules/Settings/SettingsSection/SettingsSection';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { DialogDeleteAccount } from '@/organisms/Settings/DialogDeleteAccount/DialogDeleteAccount';

/**
 * A Pubky Ring sign-in is the homeserver cookie that pubky.app in the same
 * browser also uses, so signing it out signs pubky.app out too. A Bitkit
 * grant session is the Shop's own.
 */
export const SIGN_OUT_COPY = {
  cookie: 'Signs you out of the Shop and of pubky.app in this browser. Both use the same Pubky Ring sign-in.',
  grant: 'Signs you out of the Shop in this browser. pubky.app is not signed out.',
} as const;

export function Account() {
  const router = useRouter();
  const { handleSignOut, isLoading: loadingSignOut } = useSignOut();
  const isGrantSession = useIsGrantSession();
  const [disposableAccount] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const handleOpenDeleteDialog = () => {
    setShowDeleteDialog(true);
  };
  const handleEditProfile = () => {
    router.push(SETTINGS_ROUTES.EDIT);
  };
  return (
    <>
      <SettingsSectionCard icon={UserRound} title={'Account'}>
        <SettingsSection
          title={'Sign out'}
          description={isGrantSession ? SIGN_OUT_COPY.grant : SIGN_OUT_COPY.cookie}
          buttonText={loadingSignOut ? 'Signing out...' : 'Sign out'}
          buttonIcon={LogOut}
          buttonId="sign-out-btn"
          buttonDisabled={loadingSignOut}
          buttonOnClick={handleSignOut}
        />

        <SettingsDivider />

        <SettingsSection
          title={'Edit your profile'}
          description={'Update your bio or user picture, so friends can find you easier.'}
          buttonText={'Edit profile'}
          buttonIcon={Pencil}
          buttonId="edit-profile-btn"
          buttonOnClick={handleEditProfile}
        />

        <SettingsDivider />

        <SettingsSection
          title={'Backup your account'}
          description={
            disposableAccount
              ? 'Without a backup you lose your account if you close your browser!'
              : 'You have already completed the backup, or closed your browser before doing so. Your recovery file and seed phrase have been deleted.'
          }
          buttonText={'Back up'}
          buttonIcon={LockKeyhole}
          buttonId="backup-account-btn"
          buttonDisabled={!disposableAccount}
          buttonOnClick={() => {}}
        />

        <SettingsDivider />

        <SettingsSection
          title={'Delete your account'}
          description={
            'Deleting your account will remove all of your posts, tags, profile information, contacts, custom streams, and settings or preferences.'
          }
          buttonText={'Delete Account'}
          buttonIcon={Trash2}
          buttonId="delete-account-btn"
          buttonVariant="destructive"
          buttonOnClick={handleOpenDeleteDialog}
        />
      </SettingsSectionCard>

      <DialogDeleteAccount isOpen={showDeleteDialog} onOpenChangeAction={setShowDeleteDialog} />
    </>
  );
}
