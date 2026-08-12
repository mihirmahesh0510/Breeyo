import { describe, it } from 'vitest';

// INV-01: Inventory item CRUD (create, update, get, list with search/filter/sort)
describe('Inventory item CRUD (INV-01)', () => {
  describe('create item', () => {
    it.todo('creates a new item with required fields');
    it.todo('rejects creation with missing name');
    it.todo('rejects creation with negative selling price');
    it.todo('creates an item with optional barcodes attached');
  });

  describe('update item', () => {
    it.todo('updates item fields (name, category, unit, selling price)');
    it.todo('updates par level and schedule H flag');
    it.todo('does not allow updating currentStock directly');
  });

  describe('get item', () => {
    it.todo('returns a single item with batches and barcodes');
    it.todo('returns 404 for an unknown item id');
    it.todo('returns items belonging only to the requesting clinic (RLS)');
  });

  describe('list items', () => {
    it.todo('lists all active items for the clinic');
    it.todo('excludes inactive items by default');
  });

  describe('list items with search', () => {
    it.todo('searches items by name (pg_trgm fuzzy match, per D-31)');
    it.todo('searches items by barcode number');
  });

  describe('list items with category filter', () => {
    it.todo('filters items by a single category');
    it.todo('filters items by multiple categories');
  });

  describe('list items with sort', () => {
    it.todo('sorts by name A-Z (default)');
    it.todo('sorts by stock level (low first)');
    it.todo('sorts by recently added');
    it.todo('sorts by expiring soon');
    it.todo('sorts by category');
  });
});
