import type { Request, Response } from 'express';
import type { VenueListQuery } from '../schemas/venue.schema';
import * as venueService from '../services/venueService';

export async function listCategories(_req: Request, res: Response): Promise<void> {
  const categories = await venueService.listCategories();
  res.status(200).json({ data: categories });
}

export async function listDistricts(_req: Request, res: Response): Promise<void> {
  const districts = await venueService.listDistricts();
  res.status(200).json({ data: districts });
}

export async function listVenues(_req: Request, res: Response): Promise<void> {
  const query = res.locals.query as VenueListQuery;
  const result = await venueService.listVenues(query);
  res.status(200).json({
    data: result.venues,
    meta: { page: query.page, pageSize: query.pageSize, total: result.total },
  });
}

export async function getVenue(req: Request, res: Response): Promise<void> {
  const venue = await venueService.getVenue(Number(req.params.id));
  res.status(200).json({ data: { venue } });
}
