// Conta Studio extension to the MIT-licensed rhino3dm bindings.
// Trimmed bicubic height surfaces, with exact degree-six span edge curves.
#include <vector>
#include <algorithm>
#include <cmath>

static ON_NurbsCurve* ContaEdge(const ON_Surface& s, ON_2dPoint a, ON_2dPoint b)
{
  double matrix[7][10] = {};
  const double choose[7]={1,6,15,20,15,6,1};
  for(int r=0;r<7;r++) {
    const double t=r/6.0;
    for(int c=0;c<7;c++) matrix[r][c]=choose[c]*pow(t,c)*pow(1-t,6-c);
    const ON_3dPoint p=s.PointAt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
    matrix[r][7]=p.x;matrix[r][8]=p.y;matrix[r][9]=p.z;
  }
  for(int c=0;c<7;c++) {
    int pivot=c;for(int r=c+1;r<7;r++)if(fabs(matrix[r][c])>fabs(matrix[pivot][c]))pivot=r;
    for(int j=0;j<10;j++)std::swap(matrix[c][j],matrix[pivot][j]);
    const double divisor=matrix[c][c];if(fabs(divisor)<1e-14)return nullptr;
    for(int j=c;j<10;j++)matrix[c][j]/=divisor;
    for(int r=0;r<7;r++)if(r!=c){const double f=matrix[r][c];for(int j=c;j<10;j++)matrix[r][j]-=f*matrix[c][j];}
  }
  auto curve=new ON_NurbsCurve(3,false,7,7);
  for(int k=0;k<12;k++)curve->SetKnot(k,k<6?0.0:1.0);
  for(int k=0;k<7;k++)curve->SetCV(k,ON_3dPoint(matrix[k][7],matrix[k][8],matrix[k][9]));
  return curve;
}

static BND_Brep* ContaTerrain(emscripten::val data)
{
  const int count=data["count"].as<int>();
  if(count<4||count>65)return nullptr;
  const double w=data["w"].as<double>(),h=data["h"].as<double>(),factor=data["factor"].as<double>();
  if(!(w>0&&h>0&&factor>0))return nullptr;
  const int spans=count-3;
  auto s=new ON_NurbsSurface(3,false,4,4,count,count);
  s->MakeClampedUniformKnotVector(0,1.0);s->MakeClampedUniformKnotVector(1,1.0);
  auto cvs=data["points"];
  for(int j=0;j<count;j++)for(int i=0;i<count;i++){
    auto p=cvs[j*count+i];
    s->SetCV(i,j,ON_3dPoint(p[0].as<double>()*factor,p[1].as<double>()*factor,p[2].as<double>()*factor));
  }
  if(!s->IsValid()){delete s;return nullptr;}
  auto brep=new ON_Brep();const int si=brep->AddSurface(s);
  auto polygons=data["polygons"];
  const int np=polygons["length"].as<int>();
  for(int pi=0;pi<np;pi++){
    const int fi=brep->NewFace(si).m_face_index;
    auto poly=polygons[pi];const int nr=poly["length"].as<int>();
    for(int ri=0;ri<nr;ri++){
      auto ring=poly[ri];const int length=ring["length"].as<int>();
      std::vector<ON_2dPoint> uv;
      for(int k=0;k+1<length;k++){
        auto pa=ring[k],pb=ring[k+1];
        ON_2dPoint a((pa[0].as<double>()+w/2)/w*spans,(pa[1].as<double>()+h/2)/h*spans);
        ON_2dPoint b((pb[0].as<double>()+w/2)/w*spans,(pb[1].as<double>()+h/2)/h*spans);
        if(a.DistanceTo(b)<1e-11)continue;
        std::vector<double> cuts{0.0,1.0};
        for(int knot=1;knot<spans;knot++){
          if(fabs(b.x-a.x)>1e-12){double t=(knot-a.x)/(b.x-a.x);if(t>1e-10&&t<1-1e-10)cuts.push_back(t);}
          if(fabs(b.y-a.y)>1e-12){double t=(knot-a.y)/(b.y-a.y);if(t>1e-10&&t<1-1e-10)cuts.push_back(t);}
        }
        std::sort(cuts.begin(),cuts.end());
        for(size_t c=0;c+1<cuts.size();c++)if(c==0||cuts[c]-cuts[c-1]>1e-10)
          uv.emplace_back(a.x+(b.x-a.x)*cuts[c],a.y+(b.y-a.y)*cuts[c]);
      }
      if(uv.size()<3){delete brep;return nullptr;}
      double area=0;for(size_t k=0;k<uv.size();k++){auto a=uv[k],b=uv[(k+1)%uv.size()];area+=a.x*b.y-b.x*a.y;}
      if((ri==0&&area<0)||(ri>0&&area>0))std::reverse(uv.begin(),uv.end());
      const int li=brep->NewLoop(ri==0?ON_BrepLoop::outer:ON_BrepLoop::inner,brep->m_F[fi]).m_loop_index;
      std::vector<int> vertices;
      for(auto p:uv)vertices.push_back(brep->NewVertex(s->PointAt(p.x,p.y),1e-7*factor).m_vertex_index);
      for(size_t k=0;k<uv.size();k++){
        const size_t next=(k+1)%uv.size();auto a=uv[k],b=uv[next];
        auto c3=ContaEdge(*s,a,b);if(!c3){delete brep;return nullptr;}
        const int c3i=brep->AddEdgeCurve(c3);
        const int ei=brep->NewEdge(brep->m_V[vertices[k]],brep->m_V[vertices[next]],c3i,nullptr,1e-7*factor).m_edge_index;
        auto c2=new ON_LineCurve(a,b);const int c2i=brep->AddTrimCurve(c2);
        auto& trim=brep->NewTrim(brep->m_E[ei],false,brep->m_L[li],c2i);
        trim.m_type=ON_BrepTrim::boundary;trim.m_iso=s->IsIsoparametric(*c2);
        trim.m_tolerance[0]=trim.m_tolerance[1]=1e-9;
      }
    }
  }
  brep->SetTrimIsoFlags();brep->Compact();
  if(!brep->IsValid()){delete brep;return nullptr;}
  return new BND_Brep(brep,nullptr);
}
