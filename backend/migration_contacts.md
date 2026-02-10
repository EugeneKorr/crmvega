# Migration Plan: Contacts to TypeScript

1. **Create `backend/services/contactService.ts`**:
   - Implement `getAll` with search and status filtering.
   - Implement `getSummary` (Inbox view) with complex optimizations (RPC calls for messages and unread counts).
   - Implement `getById`.
   - Implement `create`, `update`, `delete`.
   - Implement `markMessagesRead`.

2. **Create `backend/controllers/contactController.ts`**:
   - Map Express requests to `contactService` methods.
   - Handle response formatting and error catching.

3. **Convert `backend/routes/contacts.ts`**:
   - Replace `backend/routes/contacts.js` with TypeScript version.
   - Use `contactController`.

4. **Verification**:
   - Run `npm run build` to ensure no type errors.
