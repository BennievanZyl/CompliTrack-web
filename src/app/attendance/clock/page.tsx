'use client';


import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';


const STORE_ID = '05328298-fc27-4c9f-b091-bb7f6598b601';
const PRIMARY = '#1a5c38';
const DARK = '#0a1f12';


type Employee = {
  id: string; full_name: string; role: string;
  face_descriptor: number[] | null; clock_pin: string | null;
};
type AttendanceRecord = {
  id: string; employee_id: string; clock_in: string | null; clock_out: string | null;
};
type ClockResult = {
  type: 'in' | 'out'; employee: Employee; time: string; late: boolean;
};
interface FaceApiType {
  nets: {
    tinyFaceDetector: { loadFromUri: (path: string) => Promise<void> };
    faceLandmark68Net: { loadFromUri: (path: string) => Promise<void> };
    faceRecognitionNet: { loadFromUri: (path: string) => Promise<void> };
  };
  TinyFaceDetectorOptions: new () => unknown;
  LabeledFaceDescriptors: new (label: string, descriptors: Float32Array[]) => unknown;
  FaceMatcher: new (descriptors: unknown[], threshold: number) => { findBestMatch: (descriptor: Float32Array) => { label: string; distance: number } };
  detectSingleFace: (input: HTMLVideoElement, options: unknown) => { withFaceLandmarks: () => { withFaceDescriptor: () => Promise<{ descriptor: Float32Array } | null> } };
}


function getFaceApi(): FaceApiType | null {
  return (window as unknown as { faceapi: FaceApiType }).faceapi || null;
}


function initials(name: string) { return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); }
