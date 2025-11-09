// --- Global Variables ---
let video, poseNet, pose, skeleton, brain;
let isModelReady = false;
let poseCounter = 0;
let iterationCounter = 0;
let errorCounter = 0;
let timeLeft = 30;

// Yoga Pose Data
const posesArray = [
  "TADASANA (Mountain Pose)",
  "VIRABHADRASANA I (Warrior I)",
  "VIRABHADRASANA II (Warrior II)",
  "VRIKSHASANA (Tree Pose)",
  "TRIKONASANA (Triangle Pose)",
  "Adho Mukho Svanasana (Downward Dog)"
];

const imgArray = [
  "images/urdhava.jpg",
  "images/warrior1.gif",
  "images/warrior2.gif",
  "images/Tree.gif",
  "images/Tri.gif",
  "images/adhomukh.gif"
];

// --- DOM References ---
const poseTitle = document.getElementById("pose-title");
const referencePoseImg = document.getElementById("reference-pose-img");
const timerDisplay = document.getElementById("timer-display");
const accuracyBar = document.getElementById("confidence-bar");
const accuracyPercentage = document.getElementById("accuracy-percentage");
const confidenceText = document.getElementById("confidence-text");
const poseStatus = document.getElementById("pose-status");
const feedbackMessage = document.getElementById("feedback-message");
const loadingStatus = document.getElementById("loading-status");
const videoContainer = document.getElementById("video-container");
const accuracyCircle = document.getElementById("accuracy-circle");

// --- Setup Function ---
function setup() {
  let canvas = createCanvas(640, 480);
  canvas.parent(videoContainer);

  // 1️⃣ Create webcam video
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.parent(videoContainer);
  video.hide();
  video.elt.setAttribute("playsinline", "");

  // 2️⃣ Load PoseNet
  poseNet = ml5.poseNet(video, modelLoaded);
  poseNet.on("pose", gotPoses);

  // 3️⃣ Load trained ML model
  const options = { inputs: 34, outputs: 6, task: "classification", debug: true };
  brain = ml5.neuralNetwork(options);

  const modelInfo = {
    model: "model/model.json",
    metadata: "model/model_meta.json",
    weights: "model/weights.bin",
  };

  brain.load(modelInfo, brainLoaded);

  // 4️⃣ Initial UI
  poseTitle.textContent = "Loading Model...";
  loadingStatus.textContent = "Initializing camera and model...";
  referencePoseImg.src = imgArray[0];
}

// --- PoseNet Ready ---
function modelLoaded() {
  console.log("PoseNet is Ready ✅");
  loadingStatus.textContent = "PoseNet Loaded. Preparing model...";
}

// --- Model Ready ---
function brainLoaded() {
  console.log("Neural Network Model Loaded ✅");
  isModelReady = true;

  loadingStatus.textContent = "";
  poseTitle.textContent = posesArray[poseCounter];
  referencePoseImg.src = imgArray[poseCounter];
  feedbackMessage.textContent = "Model ready! Begin holding your first pose.";

  classifyPose();
}

// --- Pose Data Handler ---
function gotPoses(poses) {
  if (poses.length > 0) {
    pose = poses[0].pose;
    skeleton = poses[0].skeleton;
  } else {
    pose = null;
  }
}

// --- Normalize Pose Keypoints ---
function normalizePose(currentPose) {
  if (!currentPose || currentPose.keypoints.length === 0) return [];

  const leftHip = currentPose.keypoints.find(kp => kp.part === "leftHip");
  const rightHip = currentPose.keypoints.find(kp => kp.part === "rightHip");
  if (!leftHip || !rightHip) return [];

  const centerHipX = (leftHip.position.x + rightHip.position.x) / 2;
  const centerHipY = (leftHip.position.y + rightHip.position.y) / 2;

  const normalized = [];
  for (let i = 0; i < currentPose.keypoints.length; i++) {
    const kp = currentPose.keypoints[i];
    normalized.push(kp.position.x - centerHipX);
    normalized.push(kp.position.y - centerHipY);
  }
  return normalized;
}

// --- Classification Loop ---
async function classifyPose() {
  if (!pose || !isModelReady) {
    setTimeout(classifyPose, 500);
    return;
  }

  const inputs = normalizePose(pose);
  if (inputs.length === 0) {
    feedbackMessage.textContent = "Adjust position to fit in camera frame.";
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

// --- Handle Classification Results ---
function handleResults(results) {
  if (!results || results.length === 0) {
    setTimeout(classifyPose, 500);
    return;
  }

  const { label, confidence } = results[0];
  const detectedLabelIndex = parseInt(label);
  const confidencePct = Math.floor(confidence * 100);

  // Update Accuracy Bar + Circle
  accuracyBar.style.width = `${confidencePct}%`;
  confidenceText.textContent = `${confidencePct}%`;
  accuracyPercentage.textContent = `${confidencePct}%`;
  accuracyCircle.style.setProperty("--progress-value", confidencePct);

  if (confidence > 0.75) {
    if (detectedLabelIndex === poseCounter) {
      iterationCounter++;
      poseStatus.textContent = `✅ Correct Pose: ${posesArray[poseCounter]}`;
      feedbackMessage.textContent = `Great! Accuracy: ${confidencePct}%`;
      videoContainer.style.setProperty("--glow-color", "var(--color-green)");

      if (iterationCounter >= 30) {
        iterationCounter = 0;
        nextPose();
      }
    } else {
      errorCounter++;
      poseStatus.textContent = `❌ Wrong Pose Detected (${confidencePct}%)`;
      feedbackMessage.textContent = `Detected ${posesArray[detectedLabelIndex]}, try to adjust!`;
      videoContainer.style.setProperty("--glow-color", "var(--color-red)");

      if (errorCounter >= 4) {
        errorCounter = 0;
        iterationCounter = 0;
        timeLeft = 30;
        feedbackMessage.textContent = "Restarting timer — refocus on current pose.";
      }
    }
  } else {
    poseStatus.textContent = "⚠️ Adjust position — low confidence";
    feedbackMessage.textContent = "Keep aligning your body for better accuracy.";
    videoContainer.style.setProperty("--glow-color", "var(--color-accent-green)");
  }

  timerDisplay.textContent = `00:${String(timeLeft).padStart(2, "0")}`;
  setTimeout(classifyPose, 700);
}

// --- Move to Next Pose ---
function nextPose() {
  poseCounter++;
  if (poseCounter >= posesArray.length) {
    poseTitle.textContent = "🎉 Session Complete!";
    poseStatus.textContent = "You’ve mastered all poses!";
    referencePoseImg.src = "https://placehold.co/640x480/A8D5BA/444?text=Session+Complete";
    feedbackMessage.textContent = "Congratulations! Namaste 🙏";
    return;
  }

  poseTitle.textContent = posesArray[poseCounter];
  referencePoseImg.src = imgArray[poseCounter];
  feedbackMessage.textContent = "Get ready for the next pose!";
  timeLeft = 30;
  iterationCounter = 0;
  errorCounter = 0;

  setTimeout(classifyPose, 2000);
}

// --- Drawing Loop ---
function draw() {
  background(0);
  if (video) {
    push();
    translate(width, 0);
    scale(-1, 1);
    image(video, 0, 0, width, height);
    pop();
  }

  if (pose) {
    for (let i = 0; i < skeleton.length; i++) {
      let a = skeleton[i][0];
      let b = skeleton[i][1];
      stroke(255);
      strokeWeight(3);
      line(a.position.x, a.position.y, b.position.x, b.position.y);
    }

    for (let i = 0; i < pose.keypoints.length; i++) {
      let x = pose.keypoints[i].position.x;
      let y = pose.keypoints[i].position.y;
      fill(0, 255, 0);
      noStroke();
      ellipse(x, y, 12, 12);
    }
  }
}
