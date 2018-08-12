

class TileFinder {
    constructor(threshold, tileMinArea) {
        this._resources = [];

        this._slicer = new SetSlicer();

        this._threshold = threshold;
        this._tileMinArea = tileMinArea;
        this._tileDetailMinArea = 10;
        this._tilePerspectiveMinArea = 1000;
        this._tilesetHeight = 200;
    }

    _register(resource) {
        this._resources.push(resource);

        return resource;
    }

    _mat() {
        return this._register(new cv.Mat());
    }

    _vector() {
        return this._register(new cv.MatVector());
    }

    dispose() {
        this._resources.forEach(res => res.delete());
    }

    findTiles(imageSource) {
        let orig = this._register(cv.imread(imageSource));
        let src = this._mat();

        cv.cvtColor(orig, src, cv.COLOR_RGBA2GRAY, 0);
        cv.threshold(src, src, this._threshold, 255, cv.THRESH_BINARY);

        return {
            original: orig,
            source: src,
            tiles: this._findContours(src, this._tileMinArea),
        };
    }

    getTilesFromSet(src, setContour, setType) {
        let item = this._cutContour(src, setContour);

        let target = this._findContourAndFixPerspective(item.mat);

        let tiles = this._slicer.sliceSet(target.mat, setType).map(img => {
            let tileContours = this._findContours(img, this._tileDetailMinArea, true);

            return this._cutImageFromContours(img, tileContours);
        });

        return {
            tiles: tiles,
            source: target,
        }
    }

    randColor() {
        return new cv.Scalar(Math.round(Math.random() * 255), Math.round(Math.random() * 255),
                                      Math.round(Math.random() * 255));
    }

    drawCnt(dst, contour, color) {
        let tmpVect = this._vector();
        tmpVect.push_back(contour.mat || contour);

        cv.drawContours(dst, tmpVect, -1, color || this.randColor(), 2, cv.LINE_8);
    }

    drawBBRect(dst, bbox, color) {
        let point1 = new cv.Point(bbox.x, bbox.y);
        let point2 = new cv.Point(bbox.x + bbox.width, bbox.y + bbox.height);
        cv.rectangle(dst, point1, point2, color, 2, cv.LINE_AA, 0);
    }

    _findClusterBB(contours, imageSize) {
        let x1 = 99999, y1 = 999990, x2 = 0, y2 = 0;

        contours.forEach(c => {
            let cBB = cv.boundingRect(c.mat);

            if(imageSize) {
                if (cBB.x + cBB.width > imageSize.width || cBB.y + cBB.height > imageSize.height) {
                    return;
                }
            }

            if(cBB.x < x1) {
                x1 = cBB.x;
            }

            if(cBB.y < y1) {
                y1 = cBB.y;
            }

            if(cBB.x + cBB.width > x2) {
                x2 = cBB.x + cBB.width;
            }

            if(cBB.y + cBB.height > y2) {
                y2 = cBB.y + cBB.height;
            }
        });

        return {
            x: x1,
            y: y1,
            width: x2-x1,
            height: y2 - y1,
        }
    }

    _cutImageFromContours(src, contours, invertColors) {
        let clusterBB = this._findClusterBB(contours, src.size());

        let tmpTile = src.roi(clusterBB);
        let result = this._mat();
        tmpTile.copyTo(result);

        if(invertColors) {
            cv.bitwise_not(result, result);
        }

        if(result.size().width/result.size().height > 1) {

            let dst = this._mat();
            cv.transpose(result, dst);
            cv.flip(dst, dst,1);

            return {
                mat: dst,
                bbox: clusterBB,
            }
        }

        return {
            mat: result,
            bbox: clusterBB,
        };
    }

    _findContours(src, minArea, skipEdges) {
        let srcSize = src.size();

        let contours = this._vector();
        let hierarchy = this._mat();

        cv.findContours(src, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

        let result = [];

        for (let i = 0; i < contours.size(); ++i) {

            let cnt = this._register(contours.get(i));
            let cntBbox = cv.boundingRect(cnt);

            if(skipEdges && this._contourTouchEdge(cntBbox, srcSize)) {
                continue
            }

            let cntArea = cv.contourArea(cnt);

            if(cntArea < minArea) {
                continue;
            }

            let M = cv.moments(cnt);
            let cX = (M["m10"] / M["m00"]);
            let cY = (M["m01"] / M["m00"]);

            result.push({
                index: i,
                mat: cnt,
                area: cntArea,
                bbox: cntBbox,
                center: {x: cX, y: cY}
            });
        }

        return result;
    }

    _contourTouchEdge(cntBbox, srcSize) {
        if(cntBbox.x === 0 || cntBbox.y === 0) {
            return true;
        }

        if(cntBbox.x + cntBbox.width >= srcSize.width) {
            return true;
        }

        if(cntBbox.y + cntBbox.height >= srcSize.height) {
            return true;
        }

        return false;
    }

    _cutContour(src, contour) {
        let hullBB = cv.boundingRect(contour.mat);

        return {
            mat: src.roi(hullBB),
            cnt: contour.mat,
        };
    }

    _findContourAndFixPerspective(src) {
        let important = this._findContours(src, this._tilePerspectiveMinArea);

        important.sort((a, b) => b.area-a.area);

        let biggest = important[0];
        let bbox = cv.boundingRect(biggest.mat);

        let box = this._findContourBoxApproximation(biggest.mat);

        if(!box) {
            return null;
        }

        let corners = this._getContourBbox(box);

        return {
            mat: this._warpPerspective(src, corners, bbox, this._tilesetHeight),
            contour: biggest.mat,
            box: box
        }
    }

    _findContourBoxApproximation(contour) {
        let epsilons = [500, 200, 150, 125, 110, 100, 75, 50];

        for(let i = 0; i < epsilons.length; i++) {
            let approximation = this._mat();
            cv.approxPolyDP(contour,  approximation, epsilons[i], true);

            if(approximation.size().height === 4) {
                return approximation;
            }
        }

        return null;
    }

    _getContourBbox(contour) {
        let points = [];

        for(let x = 0; x < contour.size().height; x++) {
            let rowX = contour.intAt(x, 0);
            let rowY = contour.intAt(x, 1);

            points.push({
                x: rowX,
                y: rowY,
            })
        }

        if(points.length !== 4) {
            throw "Invalid amount of points for bounding box: " + points.length;
        }

        points.sort((a, b) => a.x - b.x);

        let lefts = points.slice(0, 2),
            rights = points.slice(2, 4);

        lefts.sort((a, b) => a.y - b.y);
        rights.sort((a, b) => a.y - b.y);

        return {
            tl: lefts[0],
            tr: rights[0],
            bl: lefts[1],
            br: rights[1],
        }
    }

    _warpPerspective(src, corners, bbox, desiredHeight) {

        let dst = this._mat();

        let ratio = bbox.width / bbox.height;
        let maxWidth = desiredHeight * ratio,
            maxHeight = desiredHeight;

        let dsize = new cv.Size(maxWidth, maxHeight);

        let srcTri = this._register(cv.matFromArray(4, 1, cv.CV_32FC2, [
            corners.tl.x, corners.tl.y,
            corners.tr.x, corners.tr.y,
            corners.br.x, corners.br.y,
            corners.bl.x, corners.bl.y,
        ]));

        let dstTri = this._register(cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0,
            maxWidth, 0,
            maxWidth, maxHeight,
            0, maxHeight
        ]));

        let M = this._register(cv.getPerspectiveTransform(srcTri, dstTri));

        cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

        return dst;
    }
}