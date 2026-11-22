import { Router } from 'express';
import {
  getVenue,
  listCategories,
  listDistricts,
  listVenues,
} from '../controllers/venueController';
import { authenticate } from '../middlewares/authenticate';
import { validate } from '../middlewares/validate';
import { venueIdParamsSchema, venueListQuerySchema } from '../schemas/venue.schema';

export const venueRoutes = Router();

venueRoutes.get('/categories', authenticate, listCategories);
// Must stay before /venues/:id so "districts" is not read as an id.
venueRoutes.get('/venues/districts', authenticate, listDistricts);
venueRoutes.get('/venues', authenticate, validate({ query: venueListQuerySchema }), listVenues);
venueRoutes.get('/venues/:id', authenticate, validate({ params: venueIdParamsSchema }), getVenue);
