import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import {
  type CreateMarketplaceListingData,
  createMarketplaceListingDefaults,
} from '@/hooks/useCreateMarketplaceListing/useCreateMarketplaceListing.types';
import type {
  ListingMediaItem,
  UseListingMediaManagerResult,
} from '@/hooks/useListingMediaManager/useListingMediaManager';
import { MarketplaceListingForm } from './MarketplaceListingForm';

function buildMedia(items: ListingMediaItem[] = []): UseListingMediaManagerResult {
  return {
    items,
    maxPhotos: 8,
    error: null,
    inputRef: createRef<HTMLInputElement>(),
    onInputChange: vi.fn(),
    choose: vi.fn(),
    removeItem: vi.fn(),
    moveItem: vi.fn(),
    setAltText: vi.fn(),
    seed: vi.fn(),
    reset: vi.fn(),
    prepare: vi.fn(),
  };
}

function photoItem(key: string, altText = ''): ListingMediaItem {
  return {
    key,
    kind: 'new',
    file: new File(['x'], `${key}.jpg`, { type: 'image/jpeg' }),
    previewUrl: `blob:${key}`,
    altText,
  };
}

function FormHarness({
  fulfillment = 'physical',
  onSubmit = vi.fn(),
  media = buildMedia(),
  mode = 'create' as const,
  saleTermsLocked = false,
}: {
  fulfillment?: CreateMarketplaceListingData['fulfillment'];
  onSubmit?: () => Promise<void>;
  media?: UseListingMediaManagerResult;
  mode?: 'create' | 'edit';
  saleTermsLocked?: boolean;
}) {
  const form = useForm<CreateMarketplaceListingData>({
    defaultValues: { ...createMarketplaceListingDefaults, fulfillment },
  });
  return (
    <MarketplaceListingForm
      form={form}
      media={media}
      onSubmit={onSubmit}
      isPublishing={false}
      mode={mode}
      saleTermsLocked={saleTermsLocked}
    />
  );
}

describe('MarketplaceListingForm', () => {
  it('renders the complete physical listing contract', () => {
    render(<FormHarness />);

    expect(screen.getByRole('heading', { name: 'Photos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Item details' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Price and availability' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delivery and returns' })).toBeInTheDocument();
    expect(screen.getByText('Pricing currency')).toBeInTheDocument();
    expect(screen.getByText('Flat shipping (USD)')).toBeInTheDocument();
    expect(screen.getByText('Weight (g)')).toBeInTheDocument();
    expect(screen.getByText('Length (cm)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish listing' })).toBeInTheDocument();
  });

  it('hides package fields for pickup listings', () => {
    render(<FormHarness fulfillment="pickup" />);

    expect(screen.queryByText('Flat shipping (USD)')).not.toBeInTheDocument();
    expect(screen.queryByText('Weight (g)')).not.toBeInTheDocument();
  });

  it('opens the photo picker and submits through the form owner', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    const media = buildMedia();
    render(<FormHarness onSubmit={onSubmit} media={media} />);

    await user.click(screen.getByRole('button', { name: 'Add photos (0/8)' }));
    await user.click(screen.getByRole('button', { name: 'Publish listing' }));

    expect(media.choose).toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('renders photos in order with cover badge, reorder, and remove controls', async () => {
    const user = userEvent.setup();
    const media = buildMedia([photoItem('one', 'Front'), photoItem('two', 'Back'), photoItem('three', 'Sole')]);
    render(<FormHarness media={media} />);

    expect(screen.getByText('Cover')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add photos (3/8)' })).toBeInTheDocument();
    // The cover cannot move earlier and the last photo cannot move later.
    expect(screen.getByRole('button', { name: 'Move photo 1 earlier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move photo 3 later' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Move photo 2 earlier' }));
    expect(media.moveItem).toHaveBeenCalledWith('two', -1);

    await user.click(screen.getByRole('button', { name: 'Move photo 1 later' }));
    expect(media.moveItem).toHaveBeenCalledWith('one', 1);

    await user.click(screen.getByRole('button', { name: 'Remove photo 3' }));
    expect(media.removeItem).toHaveBeenCalledWith('three');
  });

  it('edits per-photo descriptions through the media manager', async () => {
    const user = userEvent.setup();
    const media = buildMedia([photoItem('one')]);
    render(<FormHarness media={media} />);

    await user.type(screen.getByLabelText('Photo 1 description'), 'F');
    expect(media.setAltText).toHaveBeenCalledWith('one', 'F');
  });

  it('disables adding photos once the studio limit is reached', () => {
    const media = buildMedia(
      Array.from({ length: 8 }, (_, index) => photoItem(`photo-${index + 1}`, `Photo ${index + 1}`)),
    );
    render(<FormHarness media={media} />);

    expect(screen.getByRole('button', { name: 'Add photos (8/8)' })).toBeDisabled();
  });

  it('locks the sale format and relabels submit in edit mode', () => {
    render(<FormHarness mode="edit" />);

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByText('The sale format cannot change after publishing.')).toBeInTheDocument();
  });

  it('locks the price for published auctions', () => {
    render(<FormHarness mode="edit" saleTermsLocked />);

    expect(screen.getByLabelText('Price (USD)')).toBeDisabled();
    expect(
      screen.getByText('Auction terms (format, starting price, and schedule) are fixed once the auction is published.'),
    ).toBeInTheDocument();
  });

  it('adds and removes inventory variants', async () => {
    const user = userEvent.setup();
    render(<FormHarness fulfillment="pickup" />);

    await user.click(screen.getByRole('button', { name: 'Add variant' }));
    expect(screen.getAllByText('Seller SKU')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Remove variant 2' }));
    expect(screen.getAllByText('Seller SKU')).toHaveLength(1);
  });
});

describe('MarketplaceListingForm - Snapshots', () => {
  it('matches the physical listing form snapshot', () => {
    const { container } = render(<FormHarness />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
