import Cropper from 'cropperjs';

const RATIOS = { free: Number.NaN, square: 1, portrait: 2 / 3, landscape: 3 / 2 };

export class CropperController {
  constructor({ dialog, image, ratioButtons, confirmButton, cancelButton, getPatternRatio, onConfirm }) {
    Object.assign(this, { dialog, image, ratioButtons, confirmButton, cancelButton, getPatternRatio, onConfirm });
    this.cropper = null;
    this.bind();
  }

  bind() {
    this.ratioButtons.forEach((button) => button.addEventListener('click', () => {
      this.ratioButtons.forEach((item) => item.classList.toggle('active', item === button));
      const ratio = button.dataset.ratio === 'pattern' ? this.getPatternRatio() : RATIOS[button.dataset.ratio];
      this.cropper?.setAspectRatio(ratio);
    }));
    this.confirmButton.addEventListener('click', () => {
      if (!this.cropper) return;
      const data = this.cropper.getData(true);
      this.onConfirm({ x: data.x, y: data.y, width: data.width, height: data.height });
      this.close();
    });
    this.cancelButton.addEventListener('click', () => this.close());
    this.dialog.addEventListener('cancel', () => this.destroy());
  }

  open(source, crop = null) {
    this.image.onload = () => {
      this.destroy();
      this.cropper = new Cropper(this.image, {
        aspectRatio: Number.NaN,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.9,
        background: false,
        responsive: true,
        restore: false,
        movable: true,
        zoomable: true,
        zoomOnTouch: true,
        zoomOnWheel: true,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
        ready: () => { if (crop) this.cropper.setData(crop); },
      });
    };
    this.image.src = source;
    this.dialog.showModal();
  }

  close() { this.destroy(); this.dialog.close(); }
  destroy() { this.cropper?.destroy(); this.cropper = null; }
}
