

class TileMatcher {
    constructor(root, sampleHeight) {
        this.root = root;
        this._samples = [];
        this._height = sampleHeight;
        this._width = 140;

        this._tileSize = new cv.Size(this._width, this._height);
    }

    loadSamples(samples) {
        let promises = [];

        samples.forEach(sample => {
            let promise = new Promise((resolve, reject) => {
                let img = this.root.appendChild(document.createElement('img'));

                img.addEventListener('load', () => {

                    this._samples.push({
                        mat: this.loadImage(img),
                        type: sample.type,
                    });

                    resolve();
                });

                img.src = sample.src;
            });
        });

        return Promise.all(promises);
    }

    loadImage(img) {
        let src = cv.imread(img);

        cv.resize(src, src, this._tileSize, 0, 0, cv.INTER_AREA);
        cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY, 0);
        // cv.bitwise_not(src, src);

        return src;
    }

    /**
     * @param tileToMatch
     * @return {MatchResults}
     */
    matchTile(tileToMatch) {
        let bestSample = {
            type: null,
            score: 99999999
        };

        let result = new MatchResults();

        let rotated = this._rotateImage(tileToMatch, 180);

        let tiles = [tileToMatch, rotated];

        tiles = tiles.map(tile => this._scaleToTarget(tile));

        this._samples.forEach(sample => {

            tiles.forEach(tile => {

                let diffImg = new cv.Mat();

                cv.absdiff(tile, sample.mat, diffImg);
                let whites = cv.countNonZero(diffImg);
                let whiteRatio = whites / (diffImg.size().width*diffImg.size().height);

                result.addMatch(sample.type, whiteRatio, diffImg);
            });
        });

        rotated.delete();

        return result;
    }

    _rotateImage(src, angle) {
        let dst = new cv.Mat();
        let dsize = new cv.Size(src.cols, src.rows);
        let center = new cv.Point(src.cols / 2, src.rows / 2);

        let M = cv.getRotationMatrix2D(center, angle, 1);
        cv.warpAffine(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

        M.delete();

        return dst;
    }

    _scaleToTarget(src) {
        let tileSize = src.size();
        let tileRatio = tileSize.width / tileSize.height;

        let result = new cv.Mat();

        cv.resize(src, result, this._tileSize, 0, 0, cv.INTER_AREA);

        return result;
    }
}


class MatchResults {
    constructor() {
        this.bestMatch = {
            type: null,
            score: 99999999
        };

        this.allMatches = [];

        this._resources = [];
    }

    addMatch(type, score, diffImg) {
        this._resources.push(diffImg);

        if(score < this.bestMatch.score) {
            this.bestMatch = {
                type: type,
                score: score,
                diffImg: diffImg
            }
        }

        this.allMatches.push({
            type: type,
            score: score,
            diffImg: diffImg,
        })
    }

    dispose() {
        this._resources.forEach(r => r.delete());
    }
}