

function getImportantContours(src, minArea, skipEdges) {
    let srcSize = src.size();

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(src, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

    hierarchy.delete();

    let result = [];

    for (let i = 0; i < contours.size(); ++i) {

        let cnt = contours.get(i);
        let cntBbox = cv.boundingRect(cnt);

        if(skipEdges) {
            if(cntBbox.x === 0 || cntBbox.y === 0) {
                continue;
            }

            if(cntBbox.x + cntBbox.width >= srcSize.width) {
                continue;
            }

            if(cntBbox.y + cntBbox.height >= srcSize.height) {
                continue;
            }
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

    contours.delete();

    return result;
}


function cutContours(src, contours, upscale) {
    let SCALE = upscale || 1;
    return contours.map(cnt => {
        let hullBB = cv.boundingRect(cnt.mat);

        let cutRect = new cv.Rect(
          hullBB.x * SCALE, hullBB.y * SCALE,
          (hullBB.width) * SCALE, (hullBB.height) * SCALE
        );

        if(cutRect.x + cutRect.width > src.cols) {
            console.log('SKIPPING CUT CONTOURS', cutRect.x + cutRect.width, '::', src.rows)
          return;
        }

        return {
            mat: src.roi(cutRect),
            cnt: cnt.mat,
        };
      }).filter(c => c);
}


// function getContourBBCorners(bbox) {
//     let m2 = new cv.Mat();
//     cv.approxPolyDP(contour, m2, 100,true);
//
//     return getBbox(m2);
// }

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


function cutTilesFromClusters(src, clusters, invertColors) {

    // cv.cvtColor(src, src, cv.COLOR_GRAY2RGB, 0);

    invertColors = (typeof invertColors === "undefined") ? true : invertColors;

    return clusters.map(cluster => {

        let clusterBB = findClusterBB(cluster, src.size());

        console.log("ROI CL", src.size(), '::', clusterBB, '::', cluster);
        // let col = randColor();
        //
        // cluster.forEach(c => {
        //     drawCnt(src, c, col);
        // });
        //
        // drawBBRect(src, clusterBB, randColor());

        let tmpTile = src.roi(clusterBB);
        let tile = new cv.Mat();
        tmpTile.copyTo(tile);
        
        if(invertColors) {
            cv.bitwise_not(tile, tile);
        }
        

        // let M = cv.Mat.ones(5, 5, cv.CV_8U);
        // You can try more different parameters
        // cv.morphologyEx(tile, tile, cv.MORPH_CLOSE, M);

        console.log('TILE BB', tile.size(), '::', tile.size().width/tile.size().height);



        if(tile.size().width/tile.size().height > 1) {

            // cv.rotate(tile, tile, cv.ROTATE_90_CLOCKWISE);
            console.log('ROTATING !!!');

            let dst = new cv.Mat();
            cv.transpose(tile, dst);  
            cv.flip(dst, dst,1); 

            // let dst = new cv.Mat();
            // let dsize = new cv.Size(tile.rows, tile.cols);
            // let center = new cv.Point(tile.rows / 2, tile.cols / 2);
            // let M = cv.getRotationMatrix2D(center, 90, 1);
            // cv.warpAffine(tile, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
            // tile = rotateImage(tile, 180);

            return {
                mat: dst,
                bbox: clusterBB,
            }
        }

        

        // let ksize = new cv.Size(3, 3);
        // let anchor = new cv.Point(-1, -1);
        // // You can try more different parameters
        // cv.blur(tile, tile, ksize, anchor, cv.BORDER_DEFAULT);

        return {
            mat: tile,
            bbox: clusterBB,
        };
    });
}

function findContourAndFixPerspective(src) {
    let important = getImportantContours(src, 2000);

    important.sort((a, b) => b.area-a.area);
    let biggest = important[0];
    let bbox = cv.boundingRect(biggest.mat);

    // cv.cvtColor(src, src, cv.COLOR_GRAY2RGB, 0);

    drawBBRect(src, bbox, new cv.Scalar(0, 0, 0, 0));

    let corners = getContourBBCorners(biggest.mat);

    let m2 = new cv.Mat();
    cv.approxPolyDP(biggest.mat,  m2, 500,true);

    return {
        mat: flatten(src, corners, bbox, 200),
        contour: biggest.mat,
        box: m2
    }
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

        if(cBB.x + cBB.width > imageSize.width || cBB.y + cBB.height > imageSize.height) {
            return;
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

        let avgX = currentCluster.reduce((total, c) => total + c.center.x, 0) / currentCluster.length;

        if(Math.abs(cnt.center.x - avgX) < maxDistance) {
            currentCluster.push(cnt);
        }
        else {
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

class EventEmitter {
    constructor() {
        this._listeners = [];
    }

    addListener(callback) {
        this._listeners.push(callback);
    }

    fire(...args) {
        this._listeners.forEach(callback => callback(...args));
    }
}

class ConstantVideoFeed {
    constructor(filename) {
        this.onFrame = new EventEmitter();

        this.filename = filename;
        this.canvas = document.createElement('canvas');
        this.srcImg = document.createElement('img');
        this.srcImg.classList.add('hidden');
    }

    getLastFrame() {
        return this.canvas;
    }

    start() {
        this.srcImg.src = this.filename;

        this.srcImg.addEventListener('load', () => {
            let src = cv.imread(this.srcImg);

            cv.imshow(this.canvas, src);

            console.log('IMAGE READY !!!');

            this.onFrame.fire(this.canvas);
        })
    }

    stop() {}
}

class VideoStreamFeed {
    constructor(media, timeout) {
        this.onFrame = new EventEmitter();

        this.mediaDevices = media;
        this.video = document.createElement('video');
        this.canvas = document.createElement('canvas');

        this.timeoutId = null;
        this.timeout = timeout || 250;

        this.resolution = {
            width: { ideal: 640},
            height: {ideal: 480 },
            // width: {ideal: 1920, max: 1920},
            // height: {ideal: 1080, max: 1440},
        }
    }

    getLastFrame() {
        return this.canvas;
    }

    start() {
        console.log('Starting rear video feed with resolution', this.resolution);
        this.findDeviceId().then(deviceId => {
            const constraints = {
                audio: false,
                video: {
                    width: this.resolution.width,
                    height: this.resolution.height,
                    facingMode: "environment"
                }
            };

            this.mediaDevices.getUserMedia(constraints).then(s => this.onStreamOpened(s)).catch(e => {
                console.log('FAILED', e);
            });
        })
    }

    stop() {
        clearTimeout(this.timeoutId);

        let stream = this.video.srcObject;
        let tracks = stream.getTracks();

        tracks.forEach(function (track) {
            track.stop();
        });

        this.video.srcObject = null;
    }

    pollStream() {
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;

        if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
            this.canvas.getContext('2d').drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

            this.onFrame.fire(this.canvas);
        }
        else {
            console.log('SKIP FRAME');
        }

        this.timeoutId = setTimeout(() => this.pollStream(), this.timeout);
    }

    onStreamOpened(stream) {

        console.log('Starting streaming');

        this.video.srcObject = stream;

        this.video.play();

        this.pollStream();
    }

    findDeviceId() {
        return this.mediaDevices.enumerateDevices()
            .then(function (devices) {
                devices = devices.filter(d => d.kind === "videoinput");

                let deviceId;

                if (devices.length > 1) {
                    deviceId = devices[1].deviceId;
                }
                else {
                    deviceId = devices[0].deviceId;
                }

                return deviceId;
            });
    }
}