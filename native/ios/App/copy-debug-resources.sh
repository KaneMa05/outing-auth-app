#!/bin/bash
set -euo pipefail
destination="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/InterviewPracticeAudio"
avatarDestination="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/InterviewAvatar"
questionVideoDestination="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/InterviewQuestionVideo"
recordedDestination="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/InterviewRecordedAudio"
# Question-bank audio and local bridge credentials never ship in Release.
if [[ "$CONFIGURATION" == Debug ]]; then
  /usr/libexec/PlistBuddy -c "Add :NSLocalNetworkUsageDescription string 같은 Wi-Fi의 Mac 테스트 서버에 연결하여 모의면접 AI 자막과 피드백을 제공합니다." "$TARGET_BUILD_DIR/$INFOPLIST_PATH" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :NSAppTransportSecurity dict" "$TARGET_BUILD_DIR/$INFOPLIST_PATH" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true" "$TARGET_BUILD_DIR/$INFOPLIST_PATH" 2>/dev/null || true
  mkdir -p "$(dirname "$destination")"
  ditto "$SRCROOT/DebugResources/InterviewPracticeAudio" "$destination"
  # Full verified question recordings are prepared locally, outside tracked sources.
  # Keep this separate from the small offline practice bank and its track metadata.
  rm -rf "$recordedDestination"
  recordings="$SRCROOT/../../../.tmp/interview-recorded-audio"
  if [[ -f "$recordings/catalog.json" ]]; then
    ditto "$recordings" "$recordedDestination"
  fi
  rm -rf "$avatarDestination"
  for avatar in interviewer-man-1 interviewer-woman interviewer-man-2; do
    source="$SRCROOT/DebugResources/InterviewAvatar/$avatar.mp4"
    if [[ -f "$source" ]]; then
      mkdir -p "$avatarDestination"
      cp "$source" "$avatarDestination/$avatar.mp4"
    fi
  done
  rm -rf "$questionVideoDestination"
  if [[ -d "$SRCROOT/DebugResources/InterviewQuestionVideo" ]]; then
    ditto "$SRCROOT/DebugResources/InterviewQuestionVideo" "$questionVideoDestination"
  fi
  bridge="$SRCROOT/../../../.tmp/interview-free-api/bridge.json"
  if [[ "$PLATFORM_NAME" == iphoneos && -f "$SRCROOT/../../../.tmp/interview-free-api/bridge-device.json" ]]; then
    bridge="$SRCROOT/../../../.tmp/interview-free-api/bridge-device.json"
  fi
  if [[ -f "$bridge" ]]; then
    cp "$bridge" "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/interview-local-bridge.json"
  else
    rm -f "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/interview-local-bridge.json"
  fi
else
  rm -rf "$destination" "$avatarDestination" "$questionVideoDestination" "$recordedDestination"
  rm -f "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/interview-local-bridge.json"
fi
