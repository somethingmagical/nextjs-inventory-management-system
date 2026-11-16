import { BrowserCodeReader } from "@zxing/browser";
import {
  AztecCodeReader,
  BarcodeFormat,
  ChecksumException,
  DataMatrixReader,
  DecodeHintType,
  FormatException,
  MaxiCodeReader,
  MicroQRCodeReader,
  MultiFormatOneDReader,
  NotFoundException,
  PDF417Reader,
  QRCodeReader,
  type Reader,
} from "@zxing/library";

const productBarcodeFormats = [
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODABAR,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.CODE_128,
  BarcodeFormat.ITF,
  BarcodeFormat.RSS_14,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.MICRO_QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.AZTEC,
  BarcodeFormat.PDF_417,
  BarcodeFormat.MAXICODE,
];

function isDecodeMiss(error: unknown) {
  return error instanceof NotFoundException
    || error instanceof ChecksumException
    || error instanceof FormatException;
}

export function createProductBarcodeReader() {
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, productBarcodeFormats],
  ]);
  const readers: Reader[] = [
    new MultiFormatOneDReader(hints),
    new QRCodeReader(),
    new MicroQRCodeReader(),
    new DataMatrixReader(),
    new AztecCodeReader(),
    new PDF417Reader(),
    new MaxiCodeReader(),
  ];

  const reader: Reader = {
    decode(image, decodeHints) {
      // Empty or partial camera frames are routine, so continue without ZXing's per-frame warnings.
      for (const candidate of readers) {
        try {
          return candidate.decode(image, decodeHints ?? hints);
        } catch (error) {
          if (!isDecodeMiss(error)) throw error;
        }
      }
      throw NotFoundException.getNotFoundInstance();
    },
    reset() {
      readers.forEach((candidate) => candidate.reset());
    },
  };

  return new BrowserCodeReader(reader, hints);
}
