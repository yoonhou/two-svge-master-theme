(function() {
  let productSlideshowOptions;
  let quantity;
  let swatchSlider;

  const getQuantityInput = () => document.querySelector('.ProductForm__QuantitySelector input');
  const getSwatchSliderElement = () => document.querySelector('.cw-color-swatches-slider');

  document.addEventListener('htmx:beforeRequest', () => {
    const productSlideshow = Flickity.data('.Product__Slideshow.Carousel.flickity-enabled');

    productSlideshowOptions = productSlideshow?.options;
    quantity = getQuantityInput()?.value;
  });

  document.addEventListener('htmx:afterRequest', () => {
    const slider = new Flickity('.Product__Slideshow.Carousel', productSlideshowOptions);
    const quantityInput = getQuantityInput();

    document.querySelectorAll('.Product__SlideshowNavScroller .Product__SlideshowNavImage').forEach(navImage => {
      navImage.addEventListener('click', event => {
        event.preventDefault();

        document.querySelectorAll('.Product__SlideshowNavScroller .Product__SlideshowNavImage').forEach(item => {
          item.classList.remove('is-selected');
        });

        const media = document.getElementById(`Media${navImage.getAttribute('data-media-id')}`);
        const mediaPosition = parseInt(media?.getAttribute('data-image-media-position'), 10);

        if (!Number.isNaN(mediaPosition)) {
          slider.select(mediaPosition);
        }
      });
    });

    if (quantityInput && quantity) {
      quantityInput.value = quantity;
    }

    document.querySelector('.ProductForm__QuantitySelector [data-action="decrease-quantity"]')?.addEventListener('click', () => {
      const currentQuantity = parseInt(quantityInput?.value, 10);

      if (quantityInput && currentQuantity > 1) {
        quantityInput.value = currentQuantity - 1;
      }
    });

    document.querySelector('.ProductForm__QuantitySelector [data-action="increase-quantity"]')?.addEventListener('click', () => {
      const currentQuantity = parseInt(quantityInput?.value, 10) || 0;

      if (quantityInput) {
        quantityInput.value = currentQuantity + 1;
      }
    });

    handleSwatchSliderResize();
  });

  const handleSwatchSliderResize = () => {
    const sliderElement = getSwatchSliderElement();

    if (!sliderElement) {
      return;
    }

    if (matchMedia('(min-width:768px)').matches) {
      swatchSlider?.destroy();
      swatchSlider = null;
      return;
    }

    if (!swatchSlider) {
      swatchSlider = new Flickity(sliderElement, {
        contain: true,
        pageDots: false,
        prevNextButtons: false,
        draggable: true
      });
    }
  };

  window.addEventListener('resize', handleSwatchSliderResize);
  document.addEventListener('DOMContentLoaded', handleSwatchSliderResize);
})();
