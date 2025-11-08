// --- Global variables for p5.js and ml5.js ---
let video;
let poseNet;
let pose;
let skeleton;
let brain;
let modelReady = false;
let isPoseCorrect = false; // Flag to control timer countdown

// --- Pose and Timer State ---
let poseCounter = 0;
let targetLabel = 1; // 1-based index for your model labels
let target;
let timeLeft = 30;

let classifyInterval;
let timerInterval;

// Audio feedback (P5.sound objects)
let env; // Success sound
let wave; // Error sound

// --- Data Arrays (from your original code) ---
let posesArray = ['TADASANA', 'VIRABHADRASANA I', 'VIRABHADRASANA II', 'VRIKSHASANA', 'TRIKONASANA', 'Adho Mukho Sawasana'];
var imgArray = [];

// --- Helper Functions ---

// p5.js map function implemented explicitly
function map(value, start1, stop1, start2, stop2) {
    return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
}

// Function to update the video container border glow dynamically
function updateGlow(confidence, isCorrect) {
    const videoContainer = document.getElementById("videoContainer");
    let glowColor = "";
    
    // Ensure the glow class is always present for smooth transitions
    videoContainer.classList.add("pose-glow"); 

    if (isCorrect) {
        // Map high confidence (0.75 to 1.0) to a shade of green
        const greenValue = map(confidence, 0.75, 1.0, 100, 255); 
        glowColor = `rgb(0, ${Math.round(greenValue)}, 0)`; 
    } else {
        // Map low confidence (0.0 to 0.75) to a shade of red
        const redValue = map(confidence, 0.0, 0.75, 255, 100); 
        glowColor = `rgb(${Math.round(redValue)}, 0, 0)`;
    }
    
    // Apply dynamic color to the custom CSS property (defined in your HTML/CSS)
    videoContainer.style.setProperty('--glow-color', glowColor);
}

// --- P5.js Setup ---
function setup() {
    const CANVAS_WIDTH = 600;
    const CANVAS_HEIGHT = 470;
    var videoContainer = document.getElementById("videoContainer");
    var car = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    car.parent(videoContainer);

    video = createCapture(VIDEO);
    video.size(CANVAS_WIDTH, CANVAS_HEIGHT);
    video.hide();
    
    // NOTE: Changed detection type to 'single' for better performance
    poseNet = ml5.poseNet(video, { detectionType: 'single' }, modelLoaded);
    poseNet.on('pose', gotPoses);

    // Load sounds (ensure paths are correct)
    env = loadSound("images/file.mp3");
    wave = loadSound("images/error.mp3");
    
    // Load image paths into array (using your structure)
    imgArray[0] = { src: "./images.tada1.jpg" };
    imgArray[1] = { src: "images/warrior1.gif" };
    imgArray[2] = { src: "images/warrior2.gif" };
    imgArray[3] = { src: "images/Tree.gif" };
    imgArray[4] = { src: "images/Tri.gif" };
    imgArray[5] = { src: "images/adhomukh.gif" };
    
    // Initial State Setup
    target = posesArray[poseCounter];
    document.getElementById("poseName").textContent = target;
    document.getElementById("time").textContent = `00:${String(timeLeft).padStart(2, "0")}`;
    document.getElementById("poseImg").src = imgArray[poseCounter].src;
    
    // Initialize Neural Network
    let options = {
      inputs: 34,
      outputs: 6,
      task:'classification',
      debug: true
    }
    
    brain = ml5.neuralNetwork(options);
    const modelInfo = {
      // NOTE: Using relative path from HTML file
      model: './model/model.json',
      metadata: './model/model_meta.json',
      weights: './model/weights.bin',
    };
    brain.load(modelInfo, brainLoaded);
}

// --- Timer Logic (New, cleaner interval logic) ---
function updateTimer() {
    if (isPoseCorrect && timeLeft > 0) {
        timeLeft--;
        document.getElementById("time").textContent = `00:${String(timeLeft).padStart(2, "0")}`;
        
        if (timeLeft <= 0) {
            env.play();
            nextPose();
        }
    } else if (!pose) {
        // Optional: Show message if person is not in frame
        // document.getElementById("welldone").textContent = "Please step into the frame.";
    }
}

// --- Model Callbacks ---
function modelLoaded(){
    console.log('poseNet Ready');
}

function brainLoaded(){
    console.log("Model ready!");
    modelReady = true;
    
    // Start continuous classification and timer intervals
    classifyInterval = setInterval(classifyPose, 700);
    timerInterval = setInterval(updateTimer, 1000);
}

function gotPoses(poses){
    if(poses.length > 0){
        pose = poses[0].pose;
        skeleton = poses[0].skeleton;
    } else {
        pose = null;
    }
}

// --- Classification Logic ---
function classifyPose(){
    if (!pose || !modelReady) {
        isPoseCorrect = false;
        return;
    }

    let inputs = [];
    for (let i = 0; i < pose.keypoints.length; i++) {
        let x = pose.keypoints[i].position.x;
        let y = pose.keypoints[i].position.y;
        inputs.push(x);
        inputs.push(y);
    }
    brain.classify(inputs, gotResult);
}

function gotResult(error, results) {
    if (error || !results || results.length === 0) {
        console.error("Classification error:", error);
        isPoseCorrect = false;
        return;
    }

    const { label, confidence } = results[0];
    const confidenceThreshold = 0.75; // Minimum confidence to accept a classification
    
    // Update feedback text/sparkles (clear them first)
    document.getElementById("welldone").textContent = "";
    document.getElementById("sparkles").style.display = "none";

    const isTargetPose = (label === targetLabel.toString() && confidence > confidenceThreshold);

    if (isTargetPose) {
        // --- CORRECT POSE ---
        isPoseCorrect = true;
        document.getElementById("welldone").textContent = "Perfect! Hold the pose.";
        document.getElementById("videoContainer").classList.add("correct-glow"); // Legacy class for background color if needed
        document.getElementById("videoContainer").classList.remove("incorrect-glow");
        updateGlow(confidence, true);
        
    } else if (confidence > 0.5) { 
        // --- INCORRECT POSE (but confidently wrong) ---
        isPoseCorrect = false;
        const predictedPoseName = posesArray[parseInt(label) - 1] || "an unknown pose";
        document.getElementById("welldone").textContent = `Adjust! Looks like ${predictedPoseName}.`;
        document.getElementById("videoContainer").classList.add("incorrect-glow");
        document.getElementById("videoContainer").classList.remove("correct-glow");
        updateGlow(confidence, false);
        wave.play(); // Play error sound for confident mistakes
        
    } else {
        // --- LOW CONFIDENCE (User is not in a recognized pose) ---
        isPoseCorrect = false;
        document.getElementById("welldone").textContent = "Get into the pose and stay steady.";
        document.getElementById("videoContainer").classList.remove("correct-glow", "incorrect-glow");
        updateGlow(confidence, false); // Use low confidence for red glow
    }
}

// --- P5.js Draw Loop (Skeleton visualization) ---
function draw() {
    push();
    translate(video.width, 0);
    scale(-1, 1);
    image(video, 0, 0, video.width, video.height);
    pop(); // Return to normal coordinates for text

    if (pose) {
        push();
        translate(video.width, 0); // Re-apply flip for keypoints and skeleton
        scale(-1, 1);
        
        // Draw Keypoints
        for (let i = 0; i < pose.keypoints.length; i++) {
            let x = pose.keypoints[i].position.x;
            let y = pose.keypoints[i].position.y;
            fill(0, 255, 0); // Green keypoints
            noStroke();
            ellipse(x, y, 16, 16);
        }
        
        // Draw Skeleton
        for (let i = 0; i < skeleton.length; i++) {
            let a = skeleton[i][0];
            let b = skeleton[i][1];
            strokeWeight(6);
            stroke(257, 257, 257); // Light gray/white skeleton
            line(a.position.x, a.position.y, b.position.x, b.position.y);
        }
        pop();
    }
}

// --- Pose Progression Logic ---
function nextPose(){
    // Stop intervals temporarily to prevent race conditions
    clearInterval(classifyInterval);
    clearInterval(timerInterval);

    if (poseCounter >= posesArray.length - 1) { // Check if all poses are done
        console.log("Well done, you have learnt all poses!");
        document.getElementById("welldone").textContent = "All poses done. Well done!";
        document.getElementById("sparkles").style.display = 'block';
        document.getElementById("poseName").style.display = 'none';
        document.getElementById("poseImg").style.display = 'none';
        document.getElementById("time").style.display = 'none';
        document.getElementById("sec").style.display = 'none';
        document.getElementById("videoContainer").style.display = 'none';

    } else {
        poseCounter++;
        targetLabel = poseCounter + 1; // Update target label (1, 2, 3...)
        target = posesArray[poseCounter];
        
        document.getElementById("poseName").textContent = target;
        document.getElementById("welldone").textContent = "Well done! Next pose!";
        document.getElementById("sparkles").style.display = 'block';
        document.getElementById("poseImg").src = imgArray[poseCounter].src;
        
        // Reset timer and state
        timeLeft = 30;
        document.getElementById("time").textContent = `00:${String(timeLeft).padStart(2, "0")}`;
        isPoseCorrect = false;

        // Restart intervals
        classifyInterval = setInterval(classifyPose, 700);
        timerInterval = setInterval(updateTimer, 1000);
        console.log(`Starting ${target} (Label: ${targetLabel})`);
    }
}
// Note: Removed unused functions (dataReady, finished) which were related to training.