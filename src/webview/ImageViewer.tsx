import { useEffect, useRef, useState } from "react";
import { Box, ButtonBase, Container, Divider, Popover, Skeleton, SxProps, Typography } from "@mui/material";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";

import { centerTextSx, colorMix } from "@view/utils/style";
import { handleResetTransform, handleEyeDropper, handleExportImage, handleCopy } from "@view/action";
import { resetTransformRef } from "@view/action";
import { useDecodeImage } from "@view/hooks";
import { contextMenuStore, dataStore } from "@view/store";

const Controls = () => {
  const { resetTransform } = useControls();

  useEffect(() => {
    resetTransformRef.current = resetTransform;
    return () => {
      resetTransformRef.current = null;
    };
  }, [resetTransform]);

  return null;
};

/**
 * 計算圖片在容器中以「包含」方式顯示的寬高，實際效果類似 CSS 的 `object-fit: contain`
 */
function getContainLayout(imageWidth: number, imageHeight: number, gutterWidth = 32) {
  const containerRatio = window.innerWidth / window.innerHeight;
  const imageRatio = imageWidth / imageHeight;

  let width, height;
  if (containerRatio > imageRatio) {
    height = window.innerHeight - gutterWidth; // padding
    width = height * imageRatio;
  } else {
    width = window.innerWidth - gutterWidth;
    height = width / imageRatio;
  }

  return { width, height };
}

type ImageDisplayProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

const ImageDisplay = ({ src: initialSrc, alt, width, height }: ImageDisplayProps) => {
  const [cursor, setCursor] = useState("grab");
  const [src, loaded] = useDecodeImage(initialSrc);

  const handlePanStart = () => setCursor("grabbing");
  const handlePanStop = () => setCursor("grab");

  return (
    <TransformWrapper centerOnInit onPanningStart={handlePanStart} onPanningStop={handlePanStop}>
      <TransformComponent wrapperStyle={{ width: "100%", height: "100dvh" }} contentStyle={{ cursor }}>
        {loaded && src ? (
          <img src={src} alt={alt} style={{ display: "block", ...getContainLayout(width, height) }} />
        ) : (
          <Skeleton variant="rectangular" animation="wave" sx={getContainLayout(width, height)} />
        )}
      </TransformComponent>
      <Controls />
    </TransformWrapper>
  );
};

export const ImageViewer: React.FC = () => {
  const data = dataStore((state) => state);

  if (data && data.metadata) {
    const { fileName, width, height } = data.metadata;
    return <ImageDisplay src={data.uri} alt={fileName} width={width} height={height} />;
  }

  return (
    <Container maxWidth="md" sx={{ display: "grid", height: 1, placeItems: "center" }}>
      <Box sx={{ textAlign: "center" }}>
        <Typography variant="h5" color="error" gutterBottom>
          載入失敗：無法取得圖片資料
        </Typography>
        <Typography variant="body1">請確認圖片檔案是否存在，或重新開啟圖片檢視器。</Typography>
      </Box>
    </Container>
  );
};

const actionDropdownMenuSx: SxProps = {
  ".menu-bottom &": { mt: 0.5 },
  ".menu-top &": { mt: -0.5 },
  p: 1,
  bgcolor: "tooltip.background",
  border: 1,
  borderColor: "tooltip.border",
  borderRadius: 1,
  boxShadow: "0 2px 8px var(--vscode-widget-shadow)",
};

/**
 * 操作元件的大小（高度或寬度，取決於方向）
 */
const actionSize = { small: 26, medium: 30 };

const actionDropdownButtonSx: SxProps = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  width: 1,
  height: actionSize.small - 4,
  gap: 1.5,
  pr: 1.5,
  pl: 0.5,
  borderRadius: 0.5,
  bgcolor: "tooltip.background",
  "&:hover": { bgcolor: colorMix("tooltip.background", "text.primary", 0.95) },
  "&:active": { bgcolor: "action.active" },
  "&.active": { bgcolor: "action.active", "&:hover": { bgcolor: "action.active" } },
  "&.disabled": { color: "text.disabled" },
};

type ActionButtonProps = {
  actionIcon: `codicon codicon-${string}`;
  actionName: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
};

/**
 * 下拉選單內的按鈕元件
 */
const ActionDropdownButton = (props: ActionButtonProps) => {
  const { actionIcon, actionName, onClick, active, disabled } = props;

  let className = "";
  if (active) className += "active ";
  if (disabled) className += "disabled ";

  return (
    <ButtonBase disableRipple className={className} onClick={onClick} disabled={disabled} sx={actionDropdownButtonSx}>
      <i className={actionIcon} style={{ display: "block" }} />
      <Typography variant="caption" sx={{ color: "inherit", ...centerTextSx }}>
        {actionName}
      </Typography>
    </ButtonBase>
  );
};

export const ContextMenu = () => {
  const anchorPosition = contextMenuStore((state) => state.anchorPosition);
  const open = Boolean(anchorPosition);

  const handleClose = () => {
    contextMenuStore.setState({ anchorPosition: null });
  };

  const pending = useRef<(() => void) | null>(null);

  const handlerWrapper = (handler: () => void, { waitForTransition = false } = {}) => {
    handleClose();
    if (waitForTransition) {
      pending.current = handler;
    } else {
      handler();
    }
  };

  const handleTransitionEnd = () => {
    if (open) {
      pending.current = null;
    } else {
      pending.current?.();
    }
  };

  const handleTransitionEnter = () => {
    pending.current = null;
  };

  return (
    <Popover
      open={open}
      onClose={handleClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition!}
      slotProps={{
        paper: { elevation: 0, sx: actionDropdownMenuSx },
        transition: { onExited: handleTransitionEnd, onEnter: handleTransitionEnter },
      }}
    >
      <ActionDropdownButton
        actionIcon="codicon codicon-debug-restart"
        actionName="重設縮放與位置"
        onClick={() => handlerWrapper(handleResetTransform)}
      />

      <Divider sx={{ my: 0.5 }} />

      <ActionDropdownButton
        actionIcon="codicon codicon-inspect"
        actionName="吸取顏色並複製"
        onClick={() => handlerWrapper(handleEyeDropper, { waitForTransition: true })}
      />
      <ActionDropdownButton
        actionIcon="codicon codicon-export"
        actionName="導出為..."
        onClick={() => handlerWrapper(handleExportImage)}
      />
      <ActionDropdownButton
        actionIcon="codicon codicon-copy"
        actionName="複製至剪貼簿"
        onClick={() => handlerWrapper(handleCopy)}
      />
    </Popover>
  );
};
