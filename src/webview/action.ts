import { dataStore, invoke } from "@view/store";

const resetTransformRef: { current: (() => void) | null } = { current: null };

export { resetTransformRef };

const handleCopy = () => {
  const filePath = dataStore.getState().metadata.filePath;
  invoke("image.copy", filePath);
};

const handleEyeDropper = async () => {
  const eyeDropper = new EyeDropper();
  try {
    const result = await eyeDropper.open();
    await invoke("image.copyColor", result.sRGBHex);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    await invoke("show.error", "顏色選取失敗" + (error instanceof Error ? `: ${error.message}` : String(error)));
  }
};

const handleResetTransform = () => {
  if (resetTransformRef.current) {
    const fn = resetTransformRef.current as () => void;
    fn();
  }
};

const handleExportImage = () => {
  const filePath = dataStore.getState().metadata.filePath;
  return invoke("image.export", filePath);
};

export { handleCopy, handleEyeDropper, handleResetTransform, handleExportImage };
