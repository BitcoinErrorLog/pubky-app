'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CommerceController } from '@/controllers/commerce/commerce';
import { toast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';

export function useCommerceFavorite(listingCompositeId: string) {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { requireAuth } = useRequireAuth();
  const [isMutating, setIsMutating] = useState(false);
  const favorite = useLiveQuery(
    () => (currentUserPubky ? CommerceController.isFavorite(listingCompositeId) : false),
    [currentUserPubky, listingCompositeId],
  );

  const toggle = async (): Promise<void> => {
    const mutation = requireAuth(async () => {
      setIsMutating(true);
      try {
        if (favorite) {
          await CommerceController.commitDeleteFavorite(listingCompositeId);
        } else {
          await CommerceController.commitCreateFavorite(listingCompositeId);
        }
      } catch {
        toast({ variant: 'error', description: 'Could not update this favorite.' });
      } finally {
        setIsMutating(false);
      }
    });
    await mutation;
  };

  return {
    isFavorite: favorite ?? false,
    isLoading: Boolean(currentUserPubky) && favorite === undefined,
    isMutating,
    toggle,
  };
}
