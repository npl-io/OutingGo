import { AppError } from '../errors/AppError';
import * as venueRepository from '../repositories/venueRepository';
import type { Category, Venue } from '../repositories/venueRepository';
import type { VenueListQuery } from '../schemas/venue.schema';

export function listVenues(filters: VenueListQuery): Promise<{ venues: Venue[]; total: number }> {
  return venueRepository.listVenues(filters);
}

export async function getVenue(id: number): Promise<Venue> {
  const venue = await venueRepository.findActiveVenueById(id);
  if (venue === null) {
    throw new AppError('VENUE_NOT_FOUND', 404, 'Venue not found');
  }
  return venue;
}

export function listCategories(): Promise<Category[]> {
  return venueRepository.listActiveCategories();
}

export function listDistricts(): Promise<string[]> {
  return venueRepository.listActiveDistricts();
}
