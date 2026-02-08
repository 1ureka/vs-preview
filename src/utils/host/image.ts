import sharp from "sharp";
import * as path from "path";
import { typedKeys } from "@shared/utils/index";

/**
 * 在當前執行環境中，取得 sharp 支援的圖片格式清單
 */
const getSupportedFormats = () => {
  const formatKeys = typedKeys(sharp.format);
  return formatKeys.filter((format) => sharp.format[format].input.buffer || sharp.format[format].input.file);
};

/**
 * 取得 sharp 支援的圖片副檔名清單
 */
const getSupportedExtensions = () => {
  const formats = getSupportedFormats();
  const exts = formats.filter((v) => typeof v === "string").map((v) => v.toLowerCase());

  if (exts.includes("jpeg")) exts.push("jpg");
  if (exts.includes("jpg")) exts.push("jpeg");
  if (exts.includes("tiff")) exts.push("tif");
  if (exts.includes("tif")) exts.push("tiff");

  const set = new Set(exts.map((v) => `.${v}`));
  set.delete(".raw"); // 排除 raw 格式，因為其實際上不是圖片格式
  return set;
};

/**
 * 當前環境支援的圖片副檔名集合
 */
const supportedExtensions = getSupportedExtensions();

/**
 * 圖片的元資料
 * 註：為修復 icc, exif 等資料可能導致序列化錯誤的問題，改為只保留必要的欄位
 */
type ImageMetadata = { filePath: string; fileName: string } & Pick<
  sharp.Metadata,
  "width" | "height" | "format" | "space" | "channels" | "hasAlpha"
>;

/**
 * 打開單一圖片檔案，並回傳其 metadata，若非圖片或無法讀取則回傳 null
 */
async function openImage(filePath: string): Promise<ImageMetadata | null> {
  const ext = path.extname(filePath).toLowerCase();
  if (!supportedExtensions.has(ext)) return null;

  try {
    const metadata = await sharp(filePath).metadata();

    return {
      filePath,
      fileName: path.basename(filePath),
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      space: metadata.space,
      channels: metadata.channels,
      hasAlpha: metadata.hasAlpha,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return null;
  }
}

/**
 * 給定一個檔案路徑(假設已經確認是圖片)，產生指定格式的縮圖 base64 字串
 */
async function generateBase64(filePath: string, format: "png" | "jpeg" | "webp" = "png") {
  const metadata = await openImage(filePath);
  if (!metadata) return null;

  const image = sharp(filePath);

  let buffer: Buffer;

  if (format === "webp") {
    buffer = await image.webp().toBuffer();
  } else if (format === "jpeg") {
    buffer = await image.jpeg().toBuffer();
  } else {
    buffer = await image.png().toBuffer();
  }

  return buffer.toString("base64");
}

/**
 * 支援的導出格式
 */
type ExportFormat = "png" | "jpeg" | "webp" | "webp-lossless";

/**
 * 執行圖片轉換與導出
 */
async function exportImage(params: {
  sourcePath: string;
  savePath: string;
  format: ExportFormat;
  report: (params: { message: string; increment: number }) => void;
}) {
  const { report, sourcePath, savePath, format } = params;

  report({ message: "讀取原始圖片...", increment: 0 });
  let image = sharp(sourcePath);

  report({ message: "轉換格式中...", increment: 30 });
  if (format === "png") {
    image = image.png();
  } else if (format === "jpeg") {
    image = image.jpeg();
  } else if (format === "webp") {
    image = image.webp();
  } else if (format === "webp-lossless") {
    image = image.webp({ lossless: true });
  }

  report({ message: "寫入檔案中...", increment: 60 });
  await image.toFile(savePath);
  report({ message: "完成", increment: 100 });
}

export { openImage, generateBase64, exportImage };
export type { ImageMetadata, ExportFormat };
