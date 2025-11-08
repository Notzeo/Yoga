// --- Global Variables (P5/ML5 accessible) ---
let video;
let poseNet;
let pose;
let skeleton;
let brain; // ml5 Neural Network

let successSynth; // Tone.js for correct pose
let errorSynth;   // Tone.js for error

let state = 'waiting';
let posesArray = ['TADASANA (Mountain Pose)', 'VIRABHADRASANA I (Warrior I)', 'VIRABHADRASANA II (Warrior II)', 'VRIKSHASANA (Tree Pose)', 'TRIKONASANA (Triangle Pose)', 'Adho Mukho Svanasana (Downward Dog)'];
let imgArray = [
    "https://placehold.co/640x480/A8D5BA/444?text=TADASANA+Ref",
    "https://placehold.co/640x480/FFE8C8/444?text=Warrior+I+Ref",
    "https://placehold.co/640x480/A8D5BA/444?text=Warrior+II+Ref",
    "https://placehold.co/640x480/FFE8C8/444?text=Tree+Pose+Ref",
    "https://placehold.co/640x480/A8D5BA/444?text=Triangle+Ref",
    "https://placehold.co/640x480/FFE8C8/444?text=Downward+Dog+Ref"
];
let targetLabel = 0;
let poseCounter = 0;
let errorCounter = 0;
let iterationCounter = 0;
let timeLeft = 30;
let isModelReady = false;

// --- DOM Element References (Assumed to exist in HTML) ---
const timerDisplay = document.getElementById("timer-display");
const poseTitle = document.getElementById("pose-title");
const referencePoseImg = document.getElementById("reference-pose-img");
const videoContainer = document.getElementById("video-container");
const accuracyBar = document.getElementById('confidence-bar');
const accuracyPercentage = document.getElementById('accuracy-percentage');
const accuracyCircle = document.getElementById('accuracy-circle');
const poseStatus = document.getElementById('pose-status');
const feedbackMessage = document.getElementById('feedback-message');
const loadingStatus = document.getElementById('loading-status');
const startupOverlay = document.getElementById('startup-overlay');


// --- P5.js Setup Function ---

window.setup = function() {
    const videoContainerEl = document.getElementById("video-container");
    // Create P5 canvas and attach it to the container
    let canvas = createCanvas(640, 480); 
    canvas.parent(videoContainerEl);
    
    // CRITICAL FIX: We are removing noLoop() here so draw() runs immediately 
    // and constantly checks if the video stream is ready, like the old code.
}


/**
 * 1. Called by user click. Starts Tone.js and initiates video capture.
 */
window.startYogaSession = async function() {
    // 1. Start Tone.js Audio Context (Requires user interaction)
    try {
        await Tone.start();
        console.log("Audio Context started.");
    } catch (e) {
        console.error("Failed to start Tone Audio Context:", e);
        feedbackMessage.textContent = 'ERROR: Audio failed to start.';
        return;
    }

    // Prepare UI for loading
    loadingStatus.textContent = 'Audio ready. Activating camera... (Please grant permission)';
    poseStatus.textContent = "Status: Initializing...";
    
    // 2. Initialize Video
    video = createCapture(VIDEO);
    video.size(640, 480);
    
    // TEMPORARY: Commented out video.hide() for easy debugging.
    // REMINDER: If the video appears outside the canvas, uncomment the line below.
    // video.hide(); 
    
    // CRITICAL FIX: Use the native video element's oncanplay event.
    // This is the most reliable event to ensure video frames are available.
    video.elt.oncanplay = videoReady;
    
    // 3. Initialize Tone.js Synths
    successSynth = new Tone.Synth({ oscillator: { type: "sine" } }).toDestination();
    errorSynth = new Tone.Synth({ oscillator: { type: "square" } }).toDestination();
}

/**
 * 2. This callback runs ONLY when the video stream is successfully active and ready to draw.
 */
function videoReady() {
    console.log("Video stream is ready! PoseNet initialization starting.");
    loadingStatus.textContent = 'Video stream active. Loading PoseNet...';
    
    // CRITICAL FIX: Since draw() is already running (no noLoop in setup), 
    // we do NOT need to call loop() here. The draw() loop will now render frames.

    // 3. Initialize PoseNet
    poseNet = ml5.poseNet(video, { flipHorizontal: false }, () => {
        console.log("PoseNet Ready");
        loadingStatus.textContent = 'PoseNet Ready. Loading Classification Model...';
        initNeuralNetwork(); // Proceed to load the brain model
    });
    poseNet.on('pose', gotPoses);
}


/**
 * 4. Loads the pre-trained classification model.
 */
async function initNeuralNetwork() {
    const options = { inputs: 34, outputs: 6, task: 'classification', debug: true };
    brain = ml5.neuralNetwork(options);

    const modelInfo = {
        model: 'model/model.json', 
        metadata: 'model/model_meta.json',
        weights: 'model/model.weights.bin',
    };

    try {
        await brain.load(modelInfo);
        console.log("Classification Model Loaded");
        
        isModelReady = true;
        
        // Hide overlay and set final status
        startupOverlay.classList.add('hidden-overlay'); 
        setTimeout(() => { startupOverlay.style.display = 'none'; }, 1000); 

        targetLabel = poseCounter;
        poseTitle.textContent = posesArray[poseCounter];
        referencePoseImg.src = imgArray[poseCounter];
        
        feedbackMessage.textContent = 'Model Loaded! Start the first pose.';
        
        classifyPose(); // Start classification loop

    } catch (e) {
        console.error("Failed to load Neural Network Model:", e);
        feedbackMessage.textContent = 'ERROR: Failed to load model. Check model path.';
        poseStatus.textContent = "Status: Initialization Failed";
    }
}


// --- Pose Data Handlers ---

function gotPoses(poses) {
    if (poses.length > 0) {
        pose = poses[0].pose;
        skeleton = poses[0].skeleton;
    } else {
        pose = null;
        skeleton = null;
        if (isModelReady) {
            poseStatus.textContent = "Status: No Person Detected";
            feedbackMessage.textContent = "Please step fully into the camera frame.";
        }
    }
}


/**
 * Normalizes the keypoints relative to the center of the hips/torso.
 * @param {object} currentPose - The ml5 pose object.
 * @returns {Array<number>} - Flattened array of normalized [relativeX, relativeY] data (34 inputs).
 */
function normalizePose(currentPose) {
    if (!currentPose || currentPose.keypoints.length === 0) return [];
    
    const leftHip = currentPose.keypoints.find(kp => kp.part === 'leftHip');
    const rightHip = currentPose.keypoints.find(kp => kp.part === 'rightHip');
    
    if (!leftHip || !rightHip || leftHip.score < 0.2 || rightHip.score < 0.2) {
        return []; 
    }

    const centerHipX = (leftHip.position.x + rightHip.position.x) / 2;
    const centerHipY = (leftHip.position.y + rightHip.position.y) / 2;

    const normalizedData = [];
    for (let i = 0; i < currentPose.keypoints.length; i++) {
        let kp = currentPose.keypoints[i];
        
        let relativeX = kp.position.x - centerHipX;
        let relativeY = kp.position.y - centerHipY;

        normalizedData.push(relativeX);
        normalizedData.push(relativeY);
    }
    return normalizedData;
}


// --- Classification Loop ---

async function classifyPose() {
    if (!pose || !brain || !isModelReady) {
        setTimeout(classifyPose, 500);
        return;
    }
    
    const inputs = normalizePose(pose);
    
    if (inputs.length === 0) {
        poseStatus.textContent = "Status: Bad Detection (Recenter)";
        feedbackMessage.textContent = "Cannot detect hips/body center. Adjust position.";
        updateUI(0);
        setTimeout(classifyPose, 500);
        return;
    }

    try {
        const results = await brain.classify(inputs);
        handleResults(results);
    } catch (err) {
        console.error("Classification error:", err);
        setTimeout(classifyPose, 500);
    }
}

function handleResults(results) {
    if (!results || results.length === 0) {
        setTimeout(classifyPose, 500);
        return;
    }

    const { label, confidence } = results[0];
    const detectedLabelIndex = parseInt(label);

    updateUI(confidence); 

    if (confidence > 0.75) {
        if (detectedLabelIndex === targetLabel) {
            // POSE IS CORRECT
            videoContainer.classList.add("correct-glow");
            videoContainer.classList.remove("incorrect-glow");
            
            poseStatus.textContent = `Status: ${posesArray[targetLabel]} - Correct`;
            feedbackMessage.textContent = `Hold steady! Accuracy: ${Math.floor(confidence * 100)}%`;

            iterationCounter++;
            
            if (iterationCounter >= 30) { 
                iterationCounter = 0;
                timeLeft = 30;
                successSynth.triggerAttackRelease("C5", "8n");
                nextPose();
            } else {
                timeLeft = Math.max(0, 30 - iterationCounter); 
                setTimeout(classifyPose, 700); 
            }
        } else {
            // INCORRECT POSE
            videoContainer.classList.add("incorrect-glow");
            videoContainer.classList.remove("correct-glow");
            
            poseStatus.textContent = `Status: Detected ${posesArray[detectedLabelIndex]} (Wrong)`;
            feedbackMessage.textContent = `Wrong pose detected. Try to transition to ${posesArray[targetLabel]}.`;

            errorCounter++;

            if (errorCounter >= 4) {
                errorCounter = 0;
                iterationCounter = 0;
                timeLeft = 30;
                errorSynth.triggerAttackRelease("G3", "16n");
                feedbackMessage.textContent = "Time reset due to repeated incorrect pose. Focus on alignment!";
            }
            setTimeout(classifyPose, 700);
        }
    } else {
        // LOW CONFIDENCE
        videoContainer.classList.remove("correct-glow", "incorrect-glow");
        poseStatus.textContent = "Status: Adjusting or Low Confidence";
        feedbackMessage.textContent = "Keep adjusting your body to increase confidence in the target pose.";
        setTimeout(classifyPose, 700);
    }
}

function nextPose() {
    poseCounter++;
    if (poseCounter >= posesArray.length) {
        poseTitle.textContent = "CONGRATULATIONS! All poses complete!";
        poseStatus.textContent = "Practice Finished";
        feedbackMessage.textContent = "You successfully completed the yoga sequence. Namaste!";
        referencePoseImg.src = "https://placehold.co/640x480/A8D5BA/444?text=FINISHED";
        return;
    }

    targetLabel = poseCounter;
    poseTitle.textContent = posesArray[poseCounter];
    referencePoseImg.src = imgArray[poseCounter];
    timeLeft = 30;
    iterationCounter = 0;
    errorCounter = 0;
    
    poseStatus.textContent = `Next Pose: ${posesArray[poseCounter]}`;
    feedbackMessage.textContent = "Get ready for the next pose. You have 30 seconds to hold it.";

    setTimeout(classifyPose, 1500); 
}


// --- UI Update ---

function updateUI(confidence) {
    const percentage = Math.floor(confidence * 100);
    
    accuracyBar.style.width = `${percentage}%`;
    document.getElementById('confidence-text').innerText = `${percentage}% Confidence`;
    
    accuracyPercentage.innerText = `${percentage}%`;
    accuracyCircle.style.setProperty('--progress-value', percentage);

    timerDisplay.textContent = `00:${String(timeLeft).padStart(2, "0")}`;
}


// --- P5.js Drawing Loop ---

window.draw = function() {
    // If video hasn't been created yet (before user clicks start), do nothing.
    if (!video) return;

    // The draw loop runs constantly now, ready to display frames the moment they start arriving.
    background(0);

    // --- Video Rendering ---

    // Flip the video horizontally to create a mirror effect
    push();
    translate(width, 0); // Translate to the right edge of the canvas
    scale(-1, 1);       // Flip horizontally
    
    // Draw the video using explicit 640x480 size
    image(video, 0, 0, 640, 480); 
    pop(); 
    
    // --- Visual Debugging ---
    if (!pose || !isModelReady) {
        fill(255, 255, 255, 200); // Semi-transparent white
        noStroke();
        rect(0, height - 30, width, 30);
        
        fill(255, 100, 100);
        textSize(18);
        textAlign(LEFT, CENTER);
        text("Camera Active - Looking for Person...", 10, height - 15);
    }

    // --- Pose Overlay Drawing ---

    if (pose) {
        // Draw skeleton
        skeleton.forEach(bone => {
            stroke(255, 255, 255); // White skeleton
            strokeWeight(4);
            line(bone[0].position.x, bone[0].position.y, bone[1].position.x, bone[1].position.y);
        });
        
        // Draw keypoints
        pose.keypoints.forEach(k => {
            if (k.score > 0.1) {
                fill(0, 255, 0); // Green joints
                noStroke();
                ellipse(k.position.x, k.position.y, 16, 16);
            }
        });
    }
}