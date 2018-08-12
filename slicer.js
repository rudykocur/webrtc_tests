

class SetSlicer {
    constructor() {
        this.sliceBreakpoints = {
            'pung_conc': [[0, 0.3], [0.3, 0.7], [0.7, 1]],
            'kong_conc': [[0, 0.22], [0.22, 0.53], [0.53, 0.79], [0.79, 1]],
        }
    }

    sliceSet(image, setType) {
        if(setType === SET_TYPE_PUNG) {
            return this._slice(image, this.sliceBreakpoints.pung_conc);
        }

        return this._slice(image, this.sliceBreakpoints.kong_conc);
    }

    _slice(image, breakpoints) {
        let size = image.size();
        return breakpoints.map(bp => {
            let from = bp[0], to = bp[1];

            let rect = {
                x: from * size.width,
                y: 0,
                width: (to - from) * size.width,
                height: size.height
            };

            return image.roi(rect)
        })
    }
}