'use client';

import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { useForm, type UseFormReturn, useWatch } from 'react-hook-form';
import { getCommerceAdapterMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import type { MarketplaceCartItem } from '@/hooks/useMarketplaceCart/useMarketplaceCart';
import {
  buildMarketplaceCheckoutAggregateId,
  isMarketplaceRevisionConflict,
} from '@/libs/commerce/transaction-commands';
import { isMarketplaceSessionRequiredError } from '@/libs/error/error.utils';
import type { CommerceDeliveryAddressModelSchema } from '@/models/commerce/commerce.schema';
import { toast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useCommerceStore } from '@/stores/commerce/commerce.store';
import {
  MARKETPLACE_CHECKOUT_ADDRESS_FIELDS,
  type MarketplaceCheckoutData,
  marketplaceCheckoutDefaults,
  marketplaceCheckoutSchema,
} from './useMarketplaceCheckout.types';

/**
 * The bare (non-owner-prefixed) address id the controller works with — the
 * stored primary key is `${owner_id}:${addressId}`.
 */
function bareAddressId(address: CommerceDeliveryAddressModelSchema): string {
  return address.id.slice(address.owner_id.length + 1);
}

function addressFieldValues(
  address: CommerceDeliveryAddressModelSchema,
): Pick<MarketplaceCheckoutData, (typeof MARKETPLACE_CHECKOUT_ADDRESS_FIELDS)[number]> {
  return {
    name: address.name,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    region: address.region,
    postalCode: address.postal_code,
    countryCode: address.country_code,
  };
}

function formMatchesAddress(
  data: Pick<MarketplaceCheckoutData, (typeof MARKETPLACE_CHECKOUT_ADDRESS_FIELDS)[number]>,
  address: CommerceDeliveryAddressModelSchema,
): boolean {
  const fields = addressFieldValues(address);
  return MARKETPLACE_CHECKOUT_ADDRESS_FIELDS.every((field) => {
    const entered = field === 'countryCode' ? data[field].trim().toUpperCase() : data[field].trim();
    return entered === fields[field];
  });
}

export function useMarketplaceCheckout(
  items: MarketplaceCartItem[],
  clearCart: () => Promise<void>,
): {
  form: UseFormReturn<MarketplaceCheckoutData>;
  submit: () => Promise<boolean>;
  needsSession: boolean;
  sessionError: string | null;
  /** Saved addresses in picker order (default first, then last used). */
  addresses: CommerceDeliveryAddressModelSchema[];
  /** Composite row id of the applied saved address; null while entering a new one. */
  selectedAddressId: string | null;
  selectAddress: (id: string | null) => void;
} {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  // Connecting a session replaces this store object; the flag below clears so
  // the cart's session-required card disappears without a submit attempt.
  const marketplaceSession = useCommerceStore((state) => state.marketplaceSession);
  const [needsSession, setNeedsSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const appliedInitialAddressRef = useRef(false);
  const form = useForm<MarketplaceCheckoutData>({
    resolver: zodResolver(marketplaceCheckoutSchema),
    defaultValues: marketplaceCheckoutDefaults,
    mode: 'onChange',
  });

  const addresses = useLiveQuery(
    async () => {
      if (!currentUserPubky) return [];
      return await CommerceController.getDeliveryAddresses();
    },
    [currentUserPubky],
    [] as CommerceDeliveryAddressModelSchema[],
  );

  // Pre-fill once from the picker's top address (default, else last used) —
  // but never over anything the buyer already typed.
  useEffect(() => {
    if (appliedInitialAddressRef.current) return;
    const first = addresses[0];
    if (!first) return;
    appliedInitialAddressRef.current = true;
    if (form.formState.isDirty) return;
    form.reset({ ...form.getValues(), ...addressFieldValues(first) });
    setSelectedAddressId(first.id);
  }, [addresses, form]);

  // Editing any address field after picking a saved address turns the entry
  // back into a "new address", which is what re-reveals the save controls.
  const watchedAddressValues = useWatch({
    control: form.control,
    name: MARKETPLACE_CHECKOUT_ADDRESS_FIELDS as unknown as Array<(typeof MARKETPLACE_CHECKOUT_ADDRESS_FIELDS)[number]>,
  });
  useEffect(() => {
    setSelectedAddressId((current) => {
      if (current === null) return null;
      const selected = addresses.find(({ id }) => id === current);
      if (!selected) return null;
      // The watched values only trigger this effect; the comparison reads the
      // live form state, which a just-applied `form.reset` already reflects.
      return formMatchesAddress(form.getValues(), selected) ? current : null;
    });
  }, [addresses, watchedAddressValues, form]);

  useEffect(() => {
    if (!marketplaceSession) return;
    setNeedsSession(false);
    setSessionError(null);
  }, [marketplaceSession]);

  const selectAddress = (id: string | null) => {
    if (id === null) {
      setSelectedAddressId(null);
      return;
    }
    const address = addresses.find((candidate) => candidate.id === id);
    if (!address) return;
    form.reset({ ...form.getValues(), ...addressFieldValues(address) });
    setSelectedAddressId(id);
  };

  /**
   * Address book bookkeeping after a successful order: a used saved address
   * gets its last-used timestamp; a new address the buyer opted to keep is
   * created (and immediately marked used). Local-only writes — the address
   * itself traveled exactly once, inside the checkout command.
   */
  const persistAddressBookAfterOrder = async (data: MarketplaceCheckoutData): Promise<void> => {
    try {
      const selected = addresses.find(({ id }) => id === selectedAddressId);
      if (selected && formMatchesAddress(data, selected)) {
        await CommerceController.commitMarkDeliveryAddressUsed(bareAddressId(selected));
        return;
      }
      if (!data.saveAddress || !data.saveLabel) return;
      const addressId = crypto.randomUUID().replaceAll('-', '');
      await CommerceController.commitUpsertDeliveryAddress(addressId, {
        label: data.saveLabel,
        name: data.name,
        line1: data.line1,
        line2: data.line2,
        city: data.city,
        region: data.region,
        postalCode: data.postalCode,
        countryCode: data.countryCode.toUpperCase(),
      });
      await CommerceController.commitMarkDeliveryAddressUsed(addressId);
    } catch {
      // The order already succeeded; failing to update the local address book
      // must not look like a failed checkout.
      toast({ variant: 'error', description: 'The order was placed, but the address could not be saved.' });
    }
  };

  const submit = async (): Promise<boolean> => {
    if (!items.length) return false;
    let succeeded = false;
    await form.handleSubmit(async (data) => {
      try {
        const lines = await Promise.all(
          items.map(async (item) => {
            const record = item.listing.record;
            const projection = await CommerceController.getMarketplaceListingProjection(
              record.ownerPubky,
              record.listingId,
            );
            if (!projection) return null;
            // Snapshot the chosen variant for fulfillment display: the id and
            // its option dimensions ride the line as an ordered {name, value}
            // array (safe through the wire-casing layer) and are echoed back
            // on the order for packing slips and order rows.
            const variant = record.variants.find(({ id }) => id === item.variantId);
            const variantOptions = variant ? Object.entries(variant.options) : [];
            return {
              listingAggregateId: projection.aggregateId,
              expectedRevision: projection.serverRevision,
              quantity: item.quantity,
              ...(variant ? { variantId: variant.id } : {}),
              ...(variantOptions.length
                ? { variantOptions: variantOptions.map(([name, value]) => ({ name, value })) }
                : {}),
            };
          }),
        );
        if (lines.some((line) => line === null)) {
          toast({
            variant: 'error',
            description:
              'A listing in your cart is not registered for transactions yet — the seller needs to open it once while connected (or republish it). Nothing was ordered.',
          });
          return;
        }
        const commandId = crypto.randomUUID();
        const response = await CommerceController.executeMarketplaceCommand({
          version: 1,
          commandId,
          aggregateId: buildMarketplaceCheckoutAggregateId(commandId),
          expectedRevision: 0,
          issuedAt: new Date().toISOString(),
          kind: 'checkout.create',
          payload: {
            lines,
            deliveryAddress: {
              name: data.name,
              line1: data.line1,
              line2: data.line2,
              city: data.city,
              region: data.region,
              postalCode: data.postalCode,
              countryCode: data.countryCode.toUpperCase(),
            },
            guaranteePolicyVersion: 1,
          },
        });
        if (!response.ok) {
          if (isMarketplaceRevisionConflict(response)) {
            // The revisions were read at submit time, so a conflict means a
            // listing moved mid-checkout; the next submit re-reads them all.
            toast({
              variant: 'error',
              description: 'A listing changed while you were checking out. Review your cart and place the order again.',
            });
            return;
          }
          toast({ variant: 'error', description: response.error.message });
          return;
        }
        await persistAddressBookAfterOrder(data);
        await clearCart();
        succeeded = true;
        const mode = getCommerceAdapterMode();
        toast({
          title: 'Order created',
          description:
            mode === 'sandbox'
              ? 'Complete the sandbox payment to continue.'
              : mode === 'locks-paykit'
                ? 'Recorded by the transaction service. Open Orders to request the payment in your wallet.'
                : 'Recorded by the transaction service. Payments are not enabled here, so it will stay awaiting payment.',
        });
      } catch (checkoutError) {
        if (isMarketplaceSessionRequiredError(checkoutError)) {
          // The projection reads and the checkout command both require the
          // durable session; surface the reconnect affordance instead of a
          // generic failure toast.
          setNeedsSession(true);
          setSessionError(checkoutError.message);
          toast({ variant: 'error', description: checkoutError.message });
          return;
        }
        toast({ variant: 'error', description: 'Checkout could not be completed.' });
      }
    })();
    return succeeded;
  };

  return { form, submit, needsSession, sessionError, addresses, selectedAddressId, selectAddress };
}
