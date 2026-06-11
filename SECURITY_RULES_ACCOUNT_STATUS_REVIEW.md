# Account Status Security Rules Review

## Scope

- Firestore Standard edition, Native mode, default database.
- User-owned collections and Storage paths used by the web application.
- Server-managed account lifecycle fields on `/users/{uid}`.

## Access Model

- Missing `accountStatus` is treated as `active` for backward compatibility.
- Non-active users may read their own `/users/{uid}` document so the application can explain the restriction.
- Non-active users cannot read or write user-owned product data.
- Admin custom claims retain read access for support and operations.
- Clients cannot create or update lifecycle, role, Auth deletion, or Auth disabled fields.
- Account lifecycle mutations are performed only by founder-gated Cloud Functions using the Admin SDK.

## Queries Reviewed

- Owner document reads by document ID.
- Owner collection queries using `userId == request.auth.uid`.
- Ops queries using the server-issued `admin` custom claim.
- Storage reads and writes under `users/{uid}`.

## Residual Risks

- Missing status is active to avoid locking out existing users and signup races.
- Revoked Firebase ID tokens can remain valid briefly, so Rules, callable, Storage, and UI checks provide immediate defense in depth.
- Rules require emulator verification before deployment.
