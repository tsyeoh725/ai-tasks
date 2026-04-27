import { google } from "googleapis";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

function createOAuth2Client() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
}

async function getDriveClient(userId: string) {
  const account = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")))
    .get();

  if (!account) {
    throw new Error(`No Google account linked for user ${userId}`);
  }

  const oauth2 = createOAuth2Client();
  oauth2.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    token_type: account.tokenType ?? "Bearer",
  });

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (account.expiresAt && account.expiresAt <= nowSeconds) {
    const { credentials } = await oauth2.refreshAccessToken();
    oauth2.setCredentials(credentials);
    db.update(accounts)
      .set({
        accessToken: credentials.access_token ?? account.accessToken,
        refreshToken: credentials.refresh_token ?? account.refreshToken,
        expiresAt: credentials.expiry_date
          ? Math.floor(credentials.expiry_date / 1000)
          : account.expiresAt,
      })
      .where(eq(accounts.id, account.id))
      .run();
  }

  return google.drive({ version: "v3", auth: oauth2 });
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  modifiedTime?: string;
  iconLink?: string;
};

export async function listFolderFiles(userId: string, folderId: string): Promise<DriveFile[]> {
  const drive = await getDriveClient(userId);
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,size,webViewLink,thumbnailLink,modifiedTime,iconLink)",
    orderBy: "modifiedTime desc",
    pageSize: 50,
  });
  return (res.data.files ?? []) as DriveFile[];
}

export async function getFileMetadata(userId: string, fileId: string): Promise<DriveFile> {
  const drive = await getDriveClient(userId);
  const res = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,size,webViewLink,thumbnailLink,modifiedTime,iconLink",
  });
  return res.data as DriveFile;
}

export async function createFolder(userId: string, name: string, parentFolderId?: string): Promise<DriveFile> {
  const drive = await getDriveClient(userId);
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentFolderId ? [parentFolderId] : undefined,
    },
    fields: "id,name,mimeType,webViewLink",
  });
  return res.data as DriveFile;
}

export async function listDrives(userId: string): Promise<{ id: string; name: string }[]> {
  const drive = await getDriveClient(userId);
  // List "My Drive" root + shared drives
  const [root, shared] = await Promise.all([
    drive.files.list({
      q: "'root' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id,name)",
      pageSize: 20,
    }),
    drive.drives.list({ fields: "drives(id,name)", pageSize: 20 }).catch(() => ({ data: { drives: [] } })),
  ]);
  const rootFolders = (root.data.files ?? []).map((f) => ({ id: f.id!, name: f.name! }));
  const sharedDrives = ((shared.data as { drives?: { id?: string; name?: string }[] }).drives ?? []).map((d) => ({ id: d.id!, name: `[Shared] ${d.name}` }));
  return [...rootFolders, ...sharedDrives];
}

// OCR: export a Google Doc or image to plain text via Drive export
export async function extractTextFromFile(userId: string, fileId: string, mimeType: string): Promise<string> {
  const drive = await getDriveClient(userId);

  // Google Docs can be exported directly
  if (mimeType === "application/vnd.google-apps.document") {
    const res = await drive.files.export({ fileId, mimeType: "text/plain" }, { responseType: "text" });
    return (res.data as string) ?? "";
  }

  // For images/PDFs, use Drive's built-in OCR by copying the file as a Google Doc
  const copy = await drive.files.copy({
    fileId,
    requestBody: { name: `_ocr_${fileId}`, mimeType: "application/vnd.google-apps.document" },
    supportsAllDrives: true,
  });
  const docId = copy.data.id!;
  const text = await drive.files.export({ fileId: docId, mimeType: "text/plain" }, { responseType: "text" });
  // Clean up the temporary OCR doc
  await drive.files.delete({ fileId: docId }).catch(() => {});
  return (text.data as string) ?? "";
}
