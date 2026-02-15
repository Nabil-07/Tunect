# Upload URL-Only DTO Audit

Date: 2026-02-14

## Scope
- `src/kyc/dto/create-kyc.dto.ts`
- `src/study-materials/dto/create-material.dto.ts`
- `src/blogs/dto/create-blog.dto.ts`

## Findings

### 1) `create-kyc.dto.ts`
- Current field: `url`.
- Status: **kept for backward compatibility**.
- Migration path: new `POST /kyc/finalize` + `POST /uploads/presign` supports private S3 key flow.
- Reason retained: existing clients still submit external uploader URL payloads.

### 2) `create-material.dto.ts`
- Current field: `fileUrl`.
- Status: **kept for backward compatibility**.
- Migration path: new `POST /study-materials/finalize` + `POST /uploads/presign` supports private S3 key flow.
- Reason retained: current tutor material form uses URL-first payload shape.

### 3) `create-blog.dto.ts`
- Current field: `coverImageUrl`.
- Status: **intentionally URL-based for now**.
- Reason retained: blog images may be externally hosted CDN/editor assets; no mandatory private-object requirement was requested for blog covers in this phase.
- Future option: add blog-specific use case in presign flow if private managed media becomes required.

## Storage strategy note
- New finalize flows store S3 object keys (not public URLs) where introduced.
- Existing URL-based APIs remain functional.
- Read access for key-backed objects is provided via presigned GET (`POST /uploads/presign-get`).
