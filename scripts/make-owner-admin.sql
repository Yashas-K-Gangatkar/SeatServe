-- One-time: make the owner a CAMPUS_ADMIN on the Nova demo campus so his very
-- first "Sign in with Google" lands in the top console. No password needed —
-- the Google path only requires the email row to exist and be active.
INSERT INTO "User" ("id", "name", "phone", "email", "role", "mallId", "isActive")
VALUES (
  'cus_owner_yashas_ggl01',
  'Yashas K Gangatkar',
  '9900000999',
  'clash.2.yashas@gmail.com',
  'CAMPUS_ADMIN',
  'cmtpwdjal0005i90416rfl80i',
  true
)
ON CONFLICT ("email") DO UPDATE
SET "role" = 'CAMPUS_ADMIN',
    "mallId" = EXCLUDED."mallId",
    "isActive" = true,
    "name" = EXCLUDED."name";
