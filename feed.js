
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

        this.intervalId = null;
    }

    getLastFrame() {
        return this.canvas;
    }

    start() {
        this.srcImg.src = this.filename;

        this.srcImg.addEventListener('load', () => {
            let src = cv.imread(this.srcImg);

            cv.imshow(this.canvas, src);

            this.onFrame.fire(this.canvas);

            this.intervalId = setInterval(() => this.onFrame.fire(this.canvas), 100);
        })
    }

    stop() {
        if(this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
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