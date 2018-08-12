


function contourTouchEdge(cntBbox, srcSize) {
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

function getImportantContours(src, minArea, skipEdges) {
    let srcSize = src.size();

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(src, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

    let result = [];

    for (let i = 0; i < contours.size(); ++i) {

        let cnt = contours.get(i);
        let cntBbox = cv.boundingRect(cnt);

        if(skipEdges && contourTouchEdge(cntBbox, srcSize)) {
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

    hierarchy.delete();
    // contours.delete();

    return result;
}

function cutContour(src, contour) {
    let hullBB = cv.boundingRect(contour.mat);

    if(hullBB.x + hullBB.width > src.cols) {
        console.log('SKIPPING CUT CONTOURS', cutRect.x + cutRect.width, '::', src.rows);
      return;
    }

    return {
        mat: src.roi(hullBB),
        cnt: contour.mat,
    };
}


function cutContours(src, contours, upscale) {
    return contours.map(cnt => cutContour(src, cnt, upscale)).filter(c => c);
}


function getBbox(mat) {
    let points = [];
    for(let x = 0; x < mat.size().height; x++) {
        let rowX = mat.intAt(x, 0);
        let rowY = mat.intAt(x, 1);

        // console.log('ROW', x, '::', rowX, '::', rowY);

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

function rotateImage(src, angle) {
    // let src = cv.imread('canvasInput');
    let dst = new cv.Mat();
    let dsize = new cv.Size(src.cols, src.rows);
    let center = new cv.Point(src.cols / 2, src.rows / 2);
    // You can try more different parameters
    let M = cv.getRotationMatrix2D(center, angle, 1);
    cv.warpAffine(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

    return dst;
}

function cutTileFromContours(src, contours, invertColors) {
    let clusterBB = findClusterBB(contours, src.size());

    let tmpTile = src.roi(clusterBB);
    let tile = new cv.Mat();
    tmpTile.copyTo(tile);

    if(invertColors) {
        cv.bitwise_not(tile, tile);
    }

    if(tile.size().width/tile.size().height > 1) {

        console.log('ROTATING !!!');

        let dst = new cv.Mat();
        cv.transpose(tile, dst);
        cv.flip(dst, dst,1);

        return {
            mat: dst,
            bbox: clusterBB,
        }
    }

    return {
        mat: tile,
        bbox: clusterBB,
    };
}


function cutTilesFromClusters(src, clusters, invertColors) {

    invertColors = (typeof invertColors === "undefined") ? true : invertColors;

    return clusters.map(cluster => cutTileFromContours(src, cluster, invertColors));
}

function findApproxBbox(contour) {
    let epsilons = [500, 200, 150, 125, 110, 100, 75, 50];

    for(let i = 0; i < epsilons.length; i++) {
        let m2 = new cv.Mat();
        cv.approxPolyDP(contour,  m2, epsilons[i],true);

        // console.log('TEST', epsilons[i], '::', m2.size());

        if(m2.size().height === 4) {
            return m2;
        }
    }

    return null;
}

function findContourAndFixPerspective2(src) {
    let important = getImportantContours(src, 1000);

    important.sort((a, b) => b.area-a.area);

    let biggest = important[0];
    let bbox = cv.boundingRect(biggest.mat);

    let box = findApproxBbox(biggest.mat);

    if(!box) {
        //cv.cvtColor(src, src, cv.COLOR_GRAY2RGB, 0);
        drawCnt(src, biggest.mat);
        return null;
    }

    let corners = getBbox(box);

    return {
        mat: flatten(src, corners, bbox, 200),
        contour: biggest.mat,
        box: box
    }
}

function drawCnt(dst, contour, color) {
    let tmpVect = new cv.MatVector();
    tmpVect.push_back(contour.mat || contour);

    cv.drawContours(dst, tmpVect, -1, color || randColor(), 2, cv.LINE_8);
}

function drawBBRect(dst, bbox, color) {
    let point1 = new cv.Point(bbox.x, bbox.y);
    let point2 = new cv.Point(bbox.x + bbox.width, bbox.y + bbox.height);
    cv.rectangle(dst, point1, point2, color, 2, cv.LINE_AA, 0);
}

function findClusterBB(contours, imageSize) {
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

function simpleClusterize(contours, maxDistance, skipIndex) {
    let currentCluster = [];

    let result = [];

    contours.sort((a, b) => a.center.x - b.center.x);

    contours.forEach(cnt => {
        if(skipIndex && cnt.index === skipIndex) {
            return;
        }

        if(currentCluster.length === 0) {
            currentCluster.push(cnt);
            return;
        }

        let cntToTest;
        if(currentCluster.length > 1) {
            cntToTest = [currentCluster[0], currentCluster[currentCluster.length - 1]];
        }
        else {
            cntToTest = currentCluster;
        }

        let sorted = currentCluster.slice().sort((a, b) => (a.bbox.x+a.bbox.width) - (b.bbox.x+b.bbox.width));
        let rightmost = sorted[sorted.length-1];
        let avgX = rightmost.bbox.x + rightmost.bbox.width;

        let clusterBB = findClusterBB(currentCluster);
        let clusterBBRatio = clusterBB.width / clusterBB.height;
        let isRectangle = clusterBBRatio > 0.85 && clusterBBRatio < 1.15;
        isRectangle = false;

        // let avgX = cntToTest.reduce((total, c) => total + c.center.x, 0) / cntToTest.length;
        // let avgX = currentCluster[currentCluster.length - 1].center.x;

        // if(Math.abs(cnt.center.x - avgX) < maxDistance) {
        if((cnt.center.x - avgX) < maxDistance || isRectangle) {
            currentCluster.push(cnt);
        }
        else {
            console.log('BREAK CLUSTER. BBOX RATIO', clusterBB.width / clusterBB.height);
            result.push(currentCluster);
            currentCluster = [cnt];
        }
    });

    result.push(currentCluster);

    return result;
}

function flatten(src, corners, bbox, desiredHeight) {

    let dst = new cv.Mat();

    let ratio = bbox.width/bbox.height;
    let maxWidth = desiredHeight * ratio,
      maxHeight = desiredHeight;

    let dsize = new cv.Size(maxWidth, maxHeight);

  let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      corners.tl.x, corners.tl.y,
      corners.tr.x, corners.tr.y,
      corners.br.x, corners.br.y,
      corners.bl.x, corners.bl.y,
  ]);
  let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      maxWidth, 0,
      maxWidth, maxHeight,
      0, maxHeight
  ]);

  let M = cv.getPerspectiveTransform(srcTri, dstTri);

  cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

  return dst;
}
